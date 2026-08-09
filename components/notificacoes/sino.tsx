'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  marcarLida,
  marcarTodasLidas,
  type Notificacao,
} from '@/lib/notificacoes/actions';
import { Bell, CheckCheck } from 'lucide-react';

function haQuantoTempo(iso: string): string {
  const segundos = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (segundos < 60) return 'agora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return new Date(iso).toLocaleDateString('pt-AO', { day: '2-digit', month: 'short' });
}

export function SinoNotificacoes({
  notificacoes,
  porLer,
}: {
  notificacoes: Notificacao[];
  porLer: number;
}) {
  const [aberto, setAberto] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Fechar ao clicar fora ou com Escape — comportamento esperado de um popover
  useEffect(() => {
    if (!aberto) return;

    function foraDoPainel(e: MouseEvent) {
      if (painel.current && !painel.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }

    document.addEventListener('mousedown', foraDoPainel);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', foraDoPainel);
      document.removeEventListener('keydown', escape);
    };
  }, [aberto]);

  async function abrir(n: Notificacao) {
    setAberto(false);
    if (!n.read_at) await marcarLida(n.id);
    if (n.action_url) router.push(n.action_url);
  }

  return (
    <div ref={painel} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-600"
        aria-label={
          porLer > 0 ? `Notificações, ${porLer} por ler` : 'Notificações'
        }
        aria-expanded={aberto}
        aria-haspopup="true"
      >
        <Bell className="h-4.5 w-4.5" aria-hidden="true" />
        {porLer > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {porLer > 9 ? '9+' : porLer}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações"
          className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-navy-600">Notificações</h2>
            {porLer > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await marcarTodasLidas();
                  router.refresh();
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-500 hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          {notificacoes.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Nada de novo por agora.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {notificacoes.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => abrir(n)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                      n.read_at ? '' : 'bg-brand-50/40'
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.read_at ? 'bg-transparent' : 'bg-brand-500'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-navy-600">
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block truncate text-xs text-slate-600">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-slate-400">
                        {haQuantoTempo(n.created_at)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-slate-100 px-4 py-2.5 text-center">
            <Link
              href="/mensagens"
              onClick={() => setAberto(false)}
              className="text-xs font-medium text-slate-500 hover:text-navy-600"
            >
              Ver mensagens
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
