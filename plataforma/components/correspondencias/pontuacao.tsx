import { cn } from '@/lib/utils';

/**
 * Medidor de pontuação de correspondência.
 *
 * Mostrar o número sozinho não diz nada ao utilizador — "76" não significa
 * nada. Por isso acompanha-se sempre de uma classificação em palavras e,
 * quando pedido, da decomposição que explica de onde vem a pontuação.
 * Transparência é o que faz o utilizador confiar na recomendação.
 */
export function Pontuacao({ valor, tamanho = 'md' }: { valor: number; tamanho?: 'sm' | 'md' }) {
  const nivel =
    valor >= 75 ? 'excelente' : valor >= 55 ? 'bom' : valor >= 40 ? 'razoavel' : 'fraco';

  const cores = {
    excelente: 'bg-green-50 text-green-700 ring-green-200',
    bom: 'bg-brand-50 text-brand-700 ring-brand-200',
    razoavel: 'bg-accent-50 text-accent-700 ring-accent-200',
    fraco: 'bg-slate-100 text-slate-600 ring-slate-200',
  } as const;

  const rotulos = {
    excelente: 'Excelente',
    bom: 'Boa',
    razoavel: 'Razoável',
    fraco: 'Fraca',
  } as const;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full ring-1',
        cores[nivel],
        tamanho === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5',
      )}
      title={`Compatibilidade: ${Math.round(valor)} em 100`}
    >
      <span className={cn('font-bold', tamanho === 'sm' ? 'text-sm' : 'text-base')}>
        {Math.round(valor)}
      </span>
      <span className={tamanho === 'sm' ? 'text-xs' : 'text-sm'}>{rotulos[nivel]}</span>
    </span>
  );
}

/**
 * Decomposição da pontuação devolvida pelo motor de correspondência.
 * Espelha o objeto `score_breakdown` construído em `cf_pontuar_correspondencia`.
 */
export interface DecomposicaoScore {
  geografia: number;
  avaliacao: number;
  datas: number;
  capacidade: number;
  historico: number;
  retorno: number;
  dist_origem_km: number;
  dist_destino_km: number;
}

const CRITERIOS = [
  { chave: 'geografia',  rotulo: 'Proximidade da rota', max: 40 },
  { chave: 'avaliacao',  rotulo: 'Avaliação',           max: 20 },
  { chave: 'datas',      rotulo: 'Ajuste de datas',     max: 15 },
  { chave: 'capacidade', rotulo: 'Aproveitamento',      max: 10 },
  { chave: 'historico',  rotulo: 'Histórico conjunto',  max: 10 },
  { chave: 'retorno',    rotulo: 'Viagem de retorno',   max: 5  },
] as const satisfies ReadonlyArray<{
  chave: keyof DecomposicaoScore;
  rotulo: string;
  max: number;
}>;

export function DecomposicaoPontuacao({
  breakdown,
}: {
  breakdown: DecomposicaoScore;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        Como se chegou a esta pontuação
      </p>
      <dl className="space-y-2">
        {CRITERIOS.map(({ chave, rotulo, max }) => {
          const valor = breakdown[chave] ?? 0;
          const pct = (valor / max) * 100;
          return (
            <div key={chave} className="flex items-center gap-3 text-xs">
              <dt className="w-36 shrink-0 text-slate-500">{rotulo}</dt>
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                role="img"
                aria-label={`${rotulo}: ${valor} de ${max}`}
              >
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                />
              </div>
              <dd className="w-12 shrink-0 text-right font-medium text-navy-600">
                {valor}/{max}
              </dd>
            </div>
          );
        })}
      </dl>

      {(breakdown.dist_origem_km > 0 || breakdown.dist_destino_km > 0) && (
        <p className="pt-1 text-xs text-slate-400">
          Desvio: {breakdown.dist_origem_km} km na recolha ·{' '}
          {breakdown.dist_destino_km} km na entrega
        </p>
      )}
    </div>
  );
}
