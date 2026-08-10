import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarConversas, listarMensagens, marcarLida } from '@/lib/mensagens/actions';
import { Conversa } from './conversa';
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, Package } from 'lucide-react';

export const metadata = { title: 'Conversa' };

export default async function PaginaConversa({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ acordo?: string }>;
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const routeParams = await params;

  const filtros = await searchParams;

  const [conversas, mensagens] = await Promise.all([
    listarConversas(),
    listarMensagens(routeParams.id),
  ]);

  const conversa = conversas.find((c) => c.conversation_id === routeParams.id);
  if (!conversa) notFound();

  // Marcar como lida ao abrir
  await marcarLida(routeParams.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/mensagens"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Mensagens
      </Link>

      {filtros.acordo && (
        <div className="mb-4 flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Proposta aceite e transporte adjudicado. Combine aqui os detalhes da
            recolha com o transportador.
          </span>
        </div>
      )}

      {/* Cabeçalho da conversa */}
      <header className="cf-card mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 font-semibold text-navy-600">
              {conversa.outro_nome ?? 'Conversa'}
              {conversa.outro_verificado && (
                <ShieldCheck
                  className="h-4 w-4 text-green-500"
                  aria-label="Verificado"
                />
              )}
            </h1>
            {conversa.load_reference && (
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span className="font-mono">{conversa.load_reference}</span>
                {conversa.origin_city && (
                  <>
                    <span>·</span>
                    <span>{conversa.origin_city}</span>
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    <span>{conversa.destination_city}</span>
                  </>
                )}
              </p>
            )}
          </div>

          {conversa.load_id && (
            <Link
              href={`/cargas/${conversa.load_id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline"
            >
              <Package className="h-4 w-4" aria-hidden="true" />
              Ver carga
            </Link>
          )}
        </div>
      </header>

      <Conversa
        conversaId={routeParams.id}
        utilizadorId={perfil.user.id}
        mensagensIniciais={mensagens}
      />
    </div>
  );
}
