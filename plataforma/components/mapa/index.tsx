'use client';

import dynamic from 'next/dynamic';
import type { DadosMapa } from './mapa-rastreio';

/**
 * O Leaflet acede ao `window` no momento da importação, por isso não pode
 * ser renderizado no servidor. Este invólucro carrega-o só no browser.
 */
const MapaRastreio = dynamic(() => import('./mapa-rastreio'), {
  ssr: false,
  loading: () => (
    <div className="cf-skeleton flex items-center justify-center rounded-xl" style={{ height: 400 }}>
      <span className="text-sm text-slate-400">A carregar mapa…</span>
    </div>
  ),
});

export function Mapa({ dados, altura }: { dados: DadosMapa; altura?: number }) {
  return <MapaRastreio dados={dados} altura={altura} />;
}

export type { DadosMapa };
