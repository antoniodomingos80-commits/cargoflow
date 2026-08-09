'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { enviarMensagem, type Mensagem } from '@/lib/mensagens/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Send } from 'lucide-react';

function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-AO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarDia(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);

  if (d.toDateString() === hoje.toDateString()) return 'Hoje';
  if (d.toDateString() === ontem.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-AO', {
    day: '2-digit',
    month: 'long',
    year: d.getFullYear() === hoje.getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Conversa em tempo real.
 *
 * As mensagens iniciais vêm do servidor (bom para o primeiro carregamento e
 * para o SEO interno); as novas chegam por Supabase Realtime. O envio usa uma
 * atualização otimista — a mensagem aparece imediatamente, sem esperar pela
 * ida ao servidor. Em ligações lentas, que é o caso comum em Angola, a
 * diferença é enorme na perceção de rapidez.
 */
export function Conversa({
  conversaId,
  utilizadorId,
  mensagensIniciais,
}: {
  conversaId: string;
  utilizadorId: string;
  mensagensIniciais: Mensagem[];
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>(mensagensIniciais);
  const [texto, setTexto] = useState('');
  const [aEnviar, startTransition] = useTransition();
  const fimRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Rolar para o fim sempre que chegam mensagens
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens.length]);

  // Subscrição em tempo real
  useEffect(() => {
    const supabase = createClient();

    const canal = supabase
      .channel(`conversa:${conversaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversaId}`,
        },
        (payload) => {
          const nova = payload.new as any;
          setMensagens((atuais) => {
            // Evitar duplicar a própria mensagem já adicionada otimisticamente
            if (atuais.some((m) => m.message_id === nova.id)) return atuais;
            if (nova.sender_id === utilizadorId) {
              // Substituir a versão otimista pela real
              const semOtimista = atuais.filter(
                (m) => !m.message_id.startsWith('temp-') || m.content !== nova.content,
              );
              return [
                ...semOtimista,
                {
                  message_id: nova.id,
                  content: nova.content,
                  attachment_url: nova.attachment_url,
                  attachment_type: nova.attachment_type,
                  created_at: nova.created_at,
                  sender_id: nova.sender_id,
                  sender_name: 'Eu',
                  sou_eu: true,
                },
              ];
            }
            return [
              ...atuais,
              {
                message_id: nova.id,
                content: nova.content,
                attachment_url: nova.attachment_url,
                attachment_type: nova.attachment_type,
                created_at: nova.created_at,
                sender_id: nova.sender_id,
                sender_name: '',
                sou_eu: false,
              },
            ];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [conversaId, utilizadorId]);

  function submeter(formData: FormData) {
    const conteudo = ((formData.get('content') as string) ?? '').trim();
    if (!conteudo) return;

    // Atualização otimista
    const temporaria: Mensagem = {
      message_id: `temp-${Date.now()}`,
      content: conteudo,
      attachment_url: null,
      attachment_type: null,
      created_at: new Date().toISOString(),
      sender_id: utilizadorId,
      sender_name: 'Eu',
      sou_eu: true,
    };
    setMensagens((m) => [...m, temporaria]);
    setTexto('');

    startTransition(async () => {
      await enviarMensagem(formData);
    });
  }

  let diaAnterior = '';

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
      {/* Mensagens */}
      <div className="flex-1 space-y-3 overflow-y-auto p-1">
        {mensagens.length === 0 && (
          <p className="py-12 text-center text-sm text-slate-400">
            Ainda não há mensagens. Diga olá.
          </p>
        )}

        {mensagens.map((m) => {
          const dia = formatarDia(m.created_at);
          const mostrarDia = dia !== diaAnterior;
          diaAnterior = dia;

          return (
            <div key={m.message_id}>
              {mostrarDia && (
                <div className="my-4 flex items-center gap-3">
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium text-slate-400">{dia}</span>
                  <span className="h-px flex-1 bg-slate-200" />
                </div>
              )}

              <div className={cn('flex', m.sou_eu ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-4 py-2.5',
                    m.sou_eu
                      ? 'rounded-br-md bg-brand-500 text-white'
                      : 'rounded-bl-md bg-white text-navy-700 shadow-card',
                  )}
                >
                  {!m.sou_eu && m.sender_name && (
                    <p className="mb-0.5 text-xs font-semibold text-brand-500">
                      {m.sender_name}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {m.content}
                  </p>
                  <p
                    className={cn(
                      'mt-1 text-right text-[10px]',
                      m.sou_eu ? 'text-brand-100' : 'text-slate-400',
                    )}
                  >
                    {formatarHora(m.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>

      {/* Composição */}
      <form
        ref={formRef}
        action={submeter}
        className="mt-4 flex items-end gap-2 border-t border-slate-200 bg-white p-3"
      >
        <input type="hidden" name="conversationId" value={conversaId} />
        <textarea
          name="content"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia; Shift+Enter faz parágrafo
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Escreva a sua mensagem…"
          aria-label="Mensagem"
          className="max-h-32 flex-1 resize-none rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <Button type="submit" size="icon" disabled={!texto.trim() || aEnviar}>
          <Send className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Enviar</span>
        </Button>
      </form>
    </div>
  );
}
