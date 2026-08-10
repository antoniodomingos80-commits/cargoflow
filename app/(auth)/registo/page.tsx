'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { registar, type EstadoFormulario } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';
import { Package, Truck, Building2, CheckCircle2, ArrowLeft } from 'lucide-react';

const estadoInicial: EstadoFormulario = {};

const PERFIS = [
  {
    valor: 'MERCHANT',
    titulo: 'Comerciante',
    descricao: 'Tenho mercadoria para transportar',
    icone: Package,
  },
  {
    valor: 'CARRIER',
    titulo: 'Camionista',
    descricao: 'Tenho camião e faço transportes',
    icone: Truck,
  },
  {
    valor: 'COMPANY_ADMIN',
    titulo: 'Empresa transportadora',
    descricao: 'Giro uma frota e motoristas',
    icone: Building2,
  },
] as const;

function BotaoSubmeter() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending}>
      {pending ? 'A criar conta…' : 'Criar conta'}
    </Button>
  );
}

export default function PaginaRegisto() {
  const [estado, formAction] = useActionState(registar, estadoInicial);
  const [perfil, setPerfil] = useState<string | null>(null);

  // Ecrã de confirmação
  if (estado.sucesso) {
    return (
      <div className="w-full max-w-md animate-fade-up text-center">
        <div className="cf-card p-8">
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" aria-hidden="true" />
          <h1 className="mt-6 text-2xl font-bold text-navy-600">Conta criada</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Enviámos um email de confirmação. Clique na ligação para ativar a sua
            conta e poder entrar.
          </p>
          <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Depois de confirmar, a nossa equipa valida os seus documentos antes de
            poder publicar cargas ou viagens.
          </p>
          <Link href="/entrar" className="mt-6 block">
            <Button variant="outline" block>
              Ir para o início de sessão
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Passo 1 — escolha de perfil
  if (!perfil) {
    return (
      <div className="w-full max-w-md animate-fade-up">
        <div className="cf-card p-8">
          <div className="mb-8 text-center">
            <Logo className="justify-center" />
            <h1 className="mt-6 text-2xl font-bold text-navy-600">Criar conta</h1>
            <p className="mt-1 text-sm text-slate-500">Como vai usar a CargoFlow?</p>
          </div>

          <div className="space-y-3">
            {PERFIS.map(({ valor, titulo, descricao, icone: Icone }) => (
              <button
                key={valor}
                type="button"
                onClick={() => setPerfil(valor)}
                className={cn(
                  'flex w-full items-center gap-4 rounded-xl border border-slate-200 p-4 text-left',
                  'transition-all hover:border-brand-400 hover:bg-brand-50/50',
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
                  <Icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold text-navy-600">{titulo}</span>
                  <span className="block text-xs text-slate-500">{descricao}</span>
                </span>
              </button>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-slate-600">
            Já tem conta?{' '}
            <Link href="/entrar" className="font-semibold text-brand-500 hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    );
  }

  // Passo 2 — dados
  const ehEmpresa = perfil === 'COMPANY_ADMIN';
  const perfilEscolhido = PERFIS.find((p) => p.valor === perfil)!;

  return (
    <div className="w-full max-w-md animate-fade-up">
      <div className="cf-card p-8">
        <button
          type="button"
          onClick={() => setPerfil(null)}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Mudar perfil
        </button>

        <div className="mb-6">
          <span className="cf-badge-transit">{perfilEscolhido.titulo}</span>
          <h1 className="mt-3 text-2xl font-bold text-navy-600">Os seus dados</h1>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="role" value={perfil} />

          {estado.erro && (
            <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {estado.erro}
            </div>
          )}

          {ehEmpresa && (
            <>
              <Input
                label="Nome da empresa"
                name="companyName"
                required
                placeholder="Transportes Exemplo, Lda."
                error={estado.erros?.companyName?.[0]}
              />
              <Input
                label="NIF"
                name="taxId"
                placeholder="5417000000"
                error={estado.erros?.taxId?.[0]}
              />
            </>
          )}

          <Input
            label="Nome completo"
            name="fullName"
            required
            autoComplete="name"
            placeholder="António Manuel"
            error={estado.erros?.fullName?.[0]}
          />

          <Input
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="nome@empresa.co.ao"
            error={estado.erros?.email?.[0]}
          />

          <Input
            label="Telefone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+244923456789"
            hint="Opcional. Usado para notificações de cargas e entregas."
            error={estado.erros?.phone?.[0]}
          />

          <Input
            label="Palavra-passe"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            hint="Mínimo 8 caracteres, com uma maiúscula e um número."
            error={estado.erros?.password?.[0]}
          />

          <Input
            label="Confirmar palavra-passe"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            error={estado.erros?.confirmPassword?.[0]}
          />

          <label className="flex items-start gap-3 pt-1">
            <input
              type="checkbox"
              name="acceptTerms"
              required
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
            />
            <span className="text-xs leading-relaxed text-slate-600">
              Aceito os{' '}
              <Link href="/termos" className="text-brand-500 hover:underline">
                Termos e Condições
              </Link>{' '}
              e a{' '}
              <Link href="/privacidade" className="text-brand-500 hover:underline">
                Política de Privacidade
              </Link>
              .
            </span>
          </label>
          {estado.erros?.acceptTerms?.[0] && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {estado.erros.acceptTerms[0]}
            </p>
          )}

          <BotaoSubmeter />
        </form>
      </div>
    </div>
  );
}
