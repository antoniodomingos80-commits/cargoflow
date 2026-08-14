'use client';

import { useState } from 'react';
import { sugerirPreco } from '@/lib/pricing/actions';
import { formatCurrency } from '@/lib/utils';
import { Sparkles, Loader2 } from 'lucide-react';

/**
 * Botão "Sugerir preço" para os formulários de publicar carga/viagem.
 *
 * Lê a origem, destino e peso diretamente do formulário em que está
 * inserido (via closest('form')) no momento do clique — não precisa de
 * props ligadas a cada campo, só dos names exatos usados nesses forms.
 */
export function SugestaoPreco({
  campoPrecoName,
  moeda = 'AOA',
}: {
  /** name do <input> de preço a preencher quando o utilizador aceitar a sugestão */
  campoPrecoName: string;
  moeda?: string;
}) {
  const [aCalcular, setACalcular] = useState(false);
  const [sugestao, setSugestao] = useState<{
    valor: number;
    baseadoEm: 'historico' | 'formula';
    numOperacoes: number;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function calcular(evento: React.MouseEvent<HTMLButtonElement>) {
    const form = evento.currentTarget.closest('form');
    if (!form) return;

    const originId = (form.elements.namedItem('originId') as HTMLSelectElement)?.value;
    const destinationId = (form.elements.namedItem('destinationId') as HTMLSelectElement)?.value;
    const pesoStr = (form.elements.namedItem('weightKg') as HTMLInputElement)?.value;

    if (!originId || !destinationId) {
      setErro('Escolha a origem e o destino primeiro.');
      setSugestao(null);
      return;
    }

    setACalcular(true);
    setErro(null);
    const resultado = await sugerirPreco(originId, destinationId, Number(pesoStr) || 0);
    setACalcular(false);

    if ('erro' in resultado) {
      setErro(resultado.erro);
      setSugestao(null);
      return;
    }
    setSugestao(resultado);
  }

  function usarSugestao() {
    if (!sugestao) return;
    const campo = document.querySelector<HTMLInputElement>(`[name="${campoPrecoName}"]`);
    if (!campo) return;
    const proto = Object.getPrototypeOf(campo);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    desc?.set?.call(campo, String(sugestao.valor));
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={calcular}
        disabled={aCalcular}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline disabled:opacity-60"
      >
        {aCalcular ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Sugerir preço
      </button>

      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}

      {sugestao && (
        <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm">
          <p className="font-medium text-navy-600">
            Sugestão: {formatCurrency(sugestao.valor, moeda)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {sugestao.baseadoEm === 'historico'
              ? `Baseado em ${sugestao.numOperacoes} operações fechadas nesta rota.`
              : 'Estimativa de referência — sem histórico suficiente nesta rota ainda.'}
          </p>
          <button
            type="button"
            onClick={usarSugestao}
            className="mt-1.5 text-xs font-medium text-brand-600 hover:underline"
          >
            Usar este valor
          </button>
        </div>
      )}
    </div>
  );
}
