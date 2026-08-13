import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { ROLE_LABELS } from '@/lib/types';
import { FormularioConfiguracoes } from './formulario';

export const metadata = { title: 'Configurações' };

export default async function PaginaConfiguracoes() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const podeEditarEmpresa = ['COMPANY_ADMIN', 'PLATFORM_ADMIN'].includes(perfil.user.role);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">Configurações</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gerir perfil, empresa e preferências base da sua conta.
        </p>
      </header>

      <div className="cf-card p-4 text-sm text-slate-600">
        <p>
          <span className="font-semibold text-navy-600">Perfil atual:</span>{' '}
          {perfil.user.full_name} · {ROLE_LABELS[perfil.user.role]}
        </p>
        <p className="mt-1">
          <span className="font-semibold text-navy-600">Empresa:</span> {perfil.tenant.name}
        </p>
      </div>

      <section className="cf-card border-brand-200 bg-brand-50/60 p-5">
        <h2 className="font-semibold text-navy-600">Checklist de início</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          <li>• Preencha o nome e o telefone para que os parceiros saibam com quem estão a tratar.</li>
          <li>• Defina a moeda padrão para evitar confusões nas propostas e pagamentos.</li>
          <li>• Atualize os dados da empresa quando estiver pronto para operar com mais formalidade.</li>
        </ul>
      </section>

      <FormularioConfiguracoes
        perfil={{
          fullName: perfil.user.full_name,
          email: perfil.user.email ?? '',
          phone: perfil.user.phone ?? '',
          baseCity: (perfil.user as any).base_city ?? '',
          avatarUrl: (perfil.user as any).avatar_url ?? null,
        }}
        empresa={{
          name: perfil.tenant.name,
          taxId: perfil.tenant.tax_id ?? '',
          defaultCurrency: perfil.tenant.default_currency,
        }}
        podeEditarEmpresa={podeEditarEmpresa}
      />
    </div>
  );
}