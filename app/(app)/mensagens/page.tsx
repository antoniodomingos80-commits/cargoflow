import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarConversas } from '@/lib/mensagens/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { formatRelativeTime } from '@/lib/utils';
import { MessageSquare, ArrowRight, ShieldCheck } from 'lucide-react';

export const metadata = { title: 'Mensagens' };

export default async function PaginaMensagens() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const conversas = await listarConversas();
  const porLer = conversas.reduce((s, c) => s + Number(c.por_ler), 0);

  return (
    <PageContainer largura="estreita">
      <PageHeader
        titulo="Mensagens"
        descricao={
          conversas.length === 0
            ? 'As conversas abrem automaticamente quando há uma proposta.'
            : porLer > 0
              ? `${porLer} ${porLer === 1 ? 'mensagem por ler' : 'mensagens por ler'}`
              : `${conversas.length} ${conversas.length === 1 ? 'conversa' : 'conversas'}`
        }
      />

      {conversas.length === 0 ? (
        <EmptyState
          icone={MessageSquare}
          titulo="Ainda não tem conversas"
          texto="Assim que enviar ou receber uma proposta, abre-se aqui uma conversa com a outra parte."
          accao={{ href: '/painel', rotulo: 'Voltar ao painel' }}
        />
      ) : (
        <div className="cf-card divide-y divide-slate-100 overflow-hidden">
          {conversas.map((c) => {
            const naoLidas = Number(c.por_ler) > 0;
            return (
              <Link
                key={c.conversation_id}
                href={`/mensagens/${c.conversation_id}`}
                className="flex items-start gap-4 p-5 transition-colors hover:bg-slate-50"
              >
                <span
                  className={
                    naoLidas
                      ? 'mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white'
                      : 'mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500'
                  }
                >
                  {(c.outro_nome ?? '?')
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join('')
                    .toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={
                        naoLidas
                          ? 'truncate font-semibold text-navy-600'
                          : 'truncate font-medium text-navy-600'
                      }
                    >
                      {c.outro_nome ?? 'Conversa'}
                    </p>
                    {c.outro_verificado && (
                      <ShieldCheck
                        className="h-3.5 w-3.5 shrink-0 text-green-500"
                        aria-label="Verificado"
                      />
                    )}
                  </div>

                  {c.load_reference && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-mono">{c.load_reference}</span>
                      {c.origin_city && (
                        <>
                          <span>·</span>
                          <span>{c.origin_city}</span>
                          <ArrowRight className="h-3 w-3" aria-hidden="true" />
                          <span>{c.destination_city}</span>
                        </>
                      )}
                    </p>
                  )}

                  {c.ultima_mensagem && (
                    <p
                      className={
                        naoLidas
                          ? 'mt-1.5 truncate text-sm font-medium text-navy-600'
                          : 'mt-1.5 truncate text-sm text-slate-500'
                      }
                    >
                      {c.ultima_mensagem}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  {c.ultima_em && (
                    <p className="text-xs text-slate-400">
                      {formatRelativeTime(c.ultima_em)}
                    </p>
                  )}
                  {naoLidas && (
                    <span className="mt-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-xs font-bold text-white">
                      {c.por_ler}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
