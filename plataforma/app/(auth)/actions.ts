'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// =============================================================================
// Esquemas de validação — partilhados entre cliente e servidor.
// Validar SEMPRE no servidor: a validação no browser é conveniência, não segurança.
// =============================================================================

const entrarSchema = z.object({
  email: z.string().email('Introduza um email válido.'),
  password: z.string().min(1, 'Introduza a palavra-passe.'),
});

const registoSchema = z
  .object({
    fullName: z.string().min(3, 'Indique o seu nome completo.').max(200),
    email: z.string().email('Introduza um email válido.'),
    phone: z
      .string()
      .regex(/^\+?244\d{9}$/, 'Telefone inválido. Formato: +244923456789')
      .optional()
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'A palavra-passe deve ter pelo menos 8 caracteres.')
      .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula.')
      .regex(/[0-9]/, 'Deve conter pelo menos um número.'),
    confirmPassword: z.string(),
    // Só estes três perfis se auto-registam. PLATFORM_ADMIN e COMPANY_STAFF
    // são atribuídos manualmente — o gatilho na base de dados também impõe isto.
    role: z.enum(['MERCHANT', 'CARRIER', 'COMPANY_ADMIN']),
    companyName: z.string().max(200).optional().or(z.literal('')),
    taxId: z.string().max(50).optional().or(z.literal('')),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'É necessário aceitar os termos.' }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As palavras-passe não coincidem.',
    path: ['confirmPassword'],
  })
  .refine((d) => d.role !== 'COMPANY_ADMIN' || (d.companyName?.length ?? 0) >= 3, {
    message: 'Indique o nome da empresa.',
    path: ['companyName'],
  });

export type EstadoFormulario = {
  erro?: string;
  erros?: Record<string, string[]>;
  sucesso?: boolean;
};

// =============================================================================
// Entrar
// =============================================================================

export async function entrar(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = entrarSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mensagem deliberadamente genérica: não revelar se o email existe.
    return { erro: 'Credenciais inválidas. Verifique o email e a palavra-passe.' };
  }

  const destino = (formData.get('destino') as string) || '/painel';
  revalidatePath('/', 'layout');
  redirect(destino);
}

// =============================================================================
// Registo
//
// A criação do tenant e do registo em `users` é feita pelo gatilho
// `on_auth_user_created` na base de dados (migração 10), que corre na MESMA
// transação que cria a conta de autenticação.
//
// Porquê assim, e não em código aqui:
//   · Atomicidade — impossível ficar com conta de autenticação sem perfil
//   · Segurança — dispensa a chave service_role (que ignora todo o RLS) na app
//   · Simplicidade — não é preciso reverter inserções manualmente
//
// A aplicação só tem de passar os dados corretos em `options.data`.
// =============================================================================

export async function registar(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = registoSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone') || '',
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    role: formData.get('role'),
    companyName: formData.get('companyName') || '',
    taxId: formData.get('taxId') || '',
    acceptTerms: formData.get('acceptTerms') === 'on',
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }

  const d = parsed.data;
  const supabase = createClient();

  const { error } = await supabase.auth.signUp({
    email: d.email,
    password: d.password,
    options: {
      // Lidos pelo gatilho para construir o tenant e o utilizador
      data: {
        full_name: d.fullName,
        role: d.role,
        company_name: d.companyName || null,
        tax_id: d.taxId || null,
        phone: d.phone || null,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirmar`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { erro: 'Já existe uma conta com este email.' };
    }
    return { erro: 'Não foi possível criar a conta. Tente novamente.' };
  }

  return { sucesso: true };
}

// =============================================================================
// Recuperar palavra-passe
//
// Duas etapas: pedir o email (envia a ligação) e definir a nova palavra-passe
// (já com a sessão temporária criada pela ligação).
//
// A primeira etapa devolve SEMPRE sucesso, mesmo que o email não exista. Dizer
// "esta conta não existe" transformaria o formulário num verificador de contas
// para quem quisesse descobrir quem está registado na plataforma.
// =============================================================================

const recuperarSchema = z.object({
  email: z.string().email('Introduza um email válido.'),
});

export async function pedirRecuperacao(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = recuperarSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirmar?destino=/redefinir`,
  });

  return { sucesso: true };
}

const redefinirSchema = z
  .object({
    password: z
      .string()
      .min(8, 'A palavra-passe deve ter pelo menos 8 caracteres.')
      .regex(/[A-Z]/, 'Deve conter pelo menos uma letra maiúscula.')
      .regex(/[0-9]/, 'Deve conter pelo menos um número.'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As palavras-passe não coincidem.',
    path: ['confirmPassword'],
  });

export async function redefinirPassword(
  _estadoAnterior: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const parsed = redefinirSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();

  // A ligação do email já criou a sessão. Sem ela não há nada a redefinir —
  // e é o que impede alguém de mudar a palavra-passe de outra pessoa.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      erro:
        'A ligação expirou ou já foi usada. Peça uma nova a partir do ecrã de entrada.',
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    if (error.message.toLowerCase().includes('should be different')) {
      return { erro: 'A nova palavra-passe tem de ser diferente da anterior.' };
    }
    return { erro: 'Não foi possível alterar a palavra-passe. Tente novamente.' };
  }

  revalidatePath('/', 'layout');
  redirect('/painel');
}

// =============================================================================
// Sair
// =============================================================================

export async function sair() {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/entrar');
}
