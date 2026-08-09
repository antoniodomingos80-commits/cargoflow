import { verificacoesPendentes, decidirVerificacao } from '@/lib/admin/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS, type UserRole } from '@/lib/types';
import {
  ShieldCheck, Check, X, FileText, Truck, Building2, User, Clock,
} from 'lucide-react';

export const metadata = { title: 'Verificações' };

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default async function PaginaVerificacoes() {
  const pendentes = await verificacoesPendentes();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">Verificações pendentes</h1>
        <p className="mt-1 text-sm text-slate-500">
          {pendentes.length === 0
            ? 'Nenhuma conta à espera de verificação.'
            : `${pendentes.length} ${pendentes.length === 1 ? 'conta' : 'contas'} por rever`}
        </p>
      </header>

      {pendentes.length > 0 && (
        <div className="cf-card border-brand-200 bg-brand-50/50 p-5">
          <p className="text-sm leading-relaxed text-slate-700">
            <strong className="text-navy-600">Antes de aprovar:</strong> confirme
            que os documentos correspondem à pessoa ou empresa, que estão
            dentro da validade, e que os dados batem certo com o registo.
            Aprovar uma conta dá-lhe acesso a publicar cargas e negociar — é o
            que sustenta a confiança de toda a plataforma.
          </p>
        </div>
      )}

      {pendentes.length === 0 ? (
        <EmptyState
          icone={ShieldCheck}
          titulo="Tudo em dia"
          texto="Não há contas à espera de verificação. As novas aparecem aqui automaticamente."
          accao={{ href: '/painel', rotulo: 'Voltar ao painel' }}
        />
      ) : (
        <div className="space-y-4">
          {pendentes.map((v) => {
            const ehEmpresa = v.tenant_tipo === 'COMPANY';
            const semDocumentos = Number(v.n_documentos) === 0;

            return (
              <article key={v.user_id} className="cf-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="cf-badge-idle">
                        {ROLE_LABELS[v.role as UserRole]}
                      </span>
                      <span className="cf-badge-delayed">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        Aguarda desde {formatarData(v.criado_em)}
                      </span>
                    </div>

                    <h2 className="mt-3 flex items-center gap-2 font-semibold text-navy-600">
                      {ehEmpresa ? (
                        <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      ) : (
                        <User className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      )}
                      {v.full_name}
                    </h2>

                    {ehEmpresa && (
                      <p className="mt-0.5 text-sm text-slate-600">
                        {v.tenant_nome}
                        {v.tax_id && (
                          <span className="text-slate-400"> · NIF {v.tax_id}</span>
                        )}
                      </p>
                    )}

                    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
                      {v.email && (
                        <div>
                          <dt className="inline">Email: </dt>
                          <dd className="inline font-medium text-navy-600">{v.email}</dd>
                        </div>
                      )}
                      {v.phone && (
                        <div>
                          <dt className="inline">Telefone: </dt>
                          <dd className="inline font-medium text-navy-600">{v.phone}</dd>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        <dd
                          className={
                            semDocumentos ? 'font-medium text-accent-600' : 'font-medium text-navy-600'
                          }
                        >
                          {v.n_documentos}{' '}
                          {Number(v.n_documentos) === 1 ? 'documento' : 'documentos'}
                        </dd>
                      </div>
                      {Number(v.n_veiculos) > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                          <dd className="font-medium text-navy-600">
                            {v.n_veiculos}{' '}
                            {Number(v.n_veiculos) === 1 ? 'veículo' : 'veículos'}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {semDocumentos && (
                      <p className="mt-3 rounded-lg bg-accent-50 px-3 py-2 text-xs text-accent-800">
                        Esta conta ainda não carregou documentos. Aprovar sem
                        verificação documental compromete a confiança da plataforma.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    <form
                      action={async () => {
                        'use server';
                        await decidirVerificacao(v.user_id, true);
                      }}
                    >
                      <Button type="submit" size="sm" block>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Aprovar
                      </Button>
                    </form>
                    <form
                      action={async () => {
                        'use server';
                        await decidirVerificacao(
                          v.user_id,
                          false,
                          'Documentação insuficiente ou inválida.',
                        );
                      }}
                    >
                      <Button type="submit" size="sm" variant="ghost" block>
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Rejeitar
                      </Button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
