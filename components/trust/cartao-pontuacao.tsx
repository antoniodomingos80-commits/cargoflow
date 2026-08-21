import { Info } from 'lucide-react';
import { SectionCard } from '@/components/ui/section-card';
import { Badge } from '@/components/ui/badge';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/lib/types';
import type { ResultadoScore } from '@/lib/trust/score';
import { cn } from '@/lib/utils';

/**
 * A pontuação e o porquê dela.
 *
 * A regra que governa este componente: nunca mostrar um número sem mostrar de
 * onde veio. Cada fator aparece com o seu peso, a evidência que o produziu, e
 * — quando não há dados — a razão de estar fora do cálculo e quantos pontos
 * passaria a valer.
 */
function tomDoScore(score: number) {
  if (score >= 80) return { barra: 'bg-emerald-500', texto: 'text-emerald-600' };
  if (score >= 55) return { barra: 'bg-brand-500', texto: 'text-brand-600' };
  if (score >= 30) return { barra: 'bg-amber-500', texto: 'text-amber-600' };
  return { barra: 'bg-red-500', texto: 'text-red-600' };
}

export function CartaoPontuacao({ pontuacao }: { pontuacao: ResultadoScore }) {
  if (pontuacao.score === null) {
    return (
      <SectionCard
        titulo="Pontuação de confiança"
        descricao="Ainda não há dados suficientes para calcular uma pontuação."
      >
        <p className="text-sm leading-relaxed text-slate-600">{pontuacao.explicacao}</p>
      </SectionCard>
    );
  }

  const comDados = pontuacao.fatores.filter((f) => f.temDados);
  const tom = tomDoScore(pontuacao.score);
  const parcial = pontuacao.pesoComDados < pontuacao.pesoMaximo;

  return (
    <SectionCard
      titulo="Pontuação de confiança"
      descricao="Como a plataforma e as outras empresas vêem esta conta."
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className={cn('text-5xl font-bold leading-none tracking-tight', tom.texto)}>
            {pontuacao.score}
          </p>
          <p className="mt-1.5 text-xs uppercase tracking-wider text-slate-400">em 100</p>
        </div>

        {parcial ? (
          <Badge tom="neutro">
            Calculada sobre {pontuacao.pesoComDados} dos {pontuacao.pesoMaximo} pontos possíveis
          </Badge>
        ) : (
          <Badge tom="positivo">Todos os fatores com dados</Badge>
        )}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-600">{pontuacao.explicacao}</p>

      {parcial ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            Os fatores sem dados ficam de fora em vez de contarem zero — uma
            conta recente não é penalizada por ainda não ter histórico. À medida
            que houver operações e avaliações, entram no cálculo.
          </span>
        </p>
      ) : null}

      <ul className="mt-6 space-y-4">
        {comDados.map((f) => {
          const percentagem = Math.round(f.valor * 100);
          return (
            <li key={f.chave}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-medium text-navy-600">{f.rotulo}</p>
                <p className="text-xs tabular-nums text-slate-500">
                  {Math.round(f.pontos)} de {f.peso} pontos
                </p>
              </div>

              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`${f.rotulo}: ${percentagem} por cento`}
              >
                <div
                  className={cn('h-full rounded-full transition-all', tomDoScore(percentagem).barra)}
                  style={{ width: `${percentagem}%` }}
                />
              </div>

              <p className="mt-1.5 text-xs text-slate-500">{f.evidencia}</p>

              {f.emFalta && f.emFalta.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {f.emFalta.map((tipo) => (
                    <li key={tipo}>
                      <Badge tom="alerta">
                        Falta: {DOCUMENT_TYPE_LABELS[tipo as DocumentType] ?? tipo}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {pontuacao.indisponiveis.length > 0 ? (
        <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Fora do cálculo, por falta de dados
          </h3>
          <ul className="mt-3 space-y-2">
            {pontuacao.indisponiveis.map((f) => (
              <li key={f.chave} className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm text-slate-600">
                  {f.rotulo} — <span className="text-slate-500">{f.motivo}</span>
                </span>
                <span className="text-xs tabular-nums text-slate-400">
                  valeria {f.peso} pontos
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}
