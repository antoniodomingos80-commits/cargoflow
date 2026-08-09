'use client';

import { useState } from 'react';
import { avaliar } from '@/lib/entrega/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Star, CheckCircle2 } from 'lucide-react';

const CRITERIOS = [
  { chave: 'pontualidade',    rotulo: 'Pontualidade' },
  { chave: 'comunicacao',     rotulo: 'Comunicação' },
  { chave: 'estadoCarga',     rotulo: 'Estado da mercadoria' },
  { chave: 'profissionalismo', rotulo: 'Profissionalismo' },
] as const;

function Estrelas({
  valor,
  onChange,
  tamanho = 'md',
  rotuloAria,
}: {
  valor: number;
  onChange?: (v: number) => void;
  tamanho?: 'sm' | 'md' | 'lg';
  rotuloAria: string;
}) {
  const [pairado, setPairado] = useState(0);
  const dim = tamanho === 'lg' ? 'h-9 w-9' : tamanho === 'sm' ? 'h-4 w-4' : 'h-6 w-6';

  return (
    <div className="flex gap-1" role="radiogroup" aria-label={rotuloAria}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={valor === n}
          aria-label={`${n} ${n === 1 ? 'estrela' : 'estrelas'}`}
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => onChange && setPairado(n)}
          onMouseLeave={() => setPairado(0)}
          className={cn('transition-transform', onChange && 'hover:scale-110')}
        >
          <Star
            className={cn(
              dim,
              (pairado || valor) >= n
                ? 'fill-accent-400 text-accent-400'
                : 'text-slate-300',
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

/**
 * Avaliação mútua após a operação.
 *
 * Só aparece depois da confirmação da entrega — avaliar antes transformaria a
 * reputação numa arma de pressão durante a negociação. A regra está imposta
 * na base de dados, não apenas aqui.
 */
export function Avaliar({
  cargaId,
  quemAvalio,
}: {
  cargaId: string;
  quemAvalio: string;
}) {
  const [rating, setRating] = useState(0);
  const [detalhes, setDetalhes] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState('');
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  async function submeter() {
    if (rating === 0) {
      setErro('Escolha uma classificação geral.');
      return;
    }
    setAGravar(true);
    setErro(null);
    try {
      await avaliar({
        cargaId,
        rating,
        pontualidade: detalhes.pontualidade,
        comunicacao: detalhes.comunicacao,
        estadoCarga: detalhes.estadoCarga,
        profissionalismo: detalhes.profissionalismo,
        comentario: comentario.trim() || undefined,
      });
      setFeito(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível avaliar.');
    } finally {
      setAGravar(false);
    }
  }

  if (feito) {
    return (
      <section className="cf-card border-green-200 bg-green-50/60 p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-green-500" aria-hidden="true" />
        <p className="mt-3 font-semibold text-navy-600">Avaliação registada</p>
        <p className="mt-1 text-sm text-slate-600">
          Obrigado — as avaliações são o que torna a plataforma fiável.
        </p>
      </section>
    );
  }

  return (
    <section className="cf-card p-6">
      <h2 className="font-semibold text-navy-600">Avaliar {quemAvalio}</h2>
      <p className="mt-1 text-sm text-slate-500">
        A sua avaliação ajuda outros a decidir com quem trabalhar.
      </p>

      {erro && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="mt-6 space-y-6">
        <div className="text-center">
          <p className="text-sm font-medium text-navy-600">Classificação geral</p>
          <div className="mt-3 flex justify-center">
            <Estrelas
              valor={rating}
              onChange={setRating}
              tamanho="lg"
              rotuloAria="Classificação geral"
            />
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Detalhe (opcional)
          </p>
          {CRITERIOS.map(({ chave, rotulo }) => (
            <div key={chave} className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600">{rotulo}</span>
              <Estrelas
                valor={detalhes[chave] ?? 0}
                onChange={(v) => setDetalhes((d) => ({ ...d, [chave]: v }))}
                tamanho="sm"
                rotuloAria={rotulo}
              />
            </div>
          ))}
        </div>

        <Textarea
          label="Comentário"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="O que correu bem? O que podia ser melhor?"
        />

        <Button onClick={submeter} loading={aGravar} block>
          Enviar avaliação
        </Button>
      </div>
    </section>
  );
}

export { Estrelas };
