'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Mapa de rastreamento sobre OpenStreetMap.
 *
 * Escolha deliberada em vez do Google Maps: não exige chave de API nem cartão
 * de crédito, e a cobertura de Angola é adequada para o que precisamos
 * (estradas principais e localidades). Se um dia for preciso mais detalhe,
 * a troca é isolada neste componente.
 */

// Ícones em SVG embutido — evita depender de ficheiros externos, que é o
// problema clássico do Leaflet em bundlers como o do Next.js.
function criarIcone(cor: string, simbolo: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
      <path d="M16 0C7.2 0 0 7.2 0 16c0 11 16 26 16 26s16-15 16-26c0-8.8-7.2-16-16-16z" fill="${cor}"/>
      <circle cx="16" cy="15" r="10" fill="white"/>
      <text x="16" y="20" font-size="12" text-anchor="middle" fill="${cor}" font-family="sans-serif" font-weight="bold">${simbolo}</text>
    </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
  });
}

/** Ajusta o zoom para caber todos os pontos relevantes */
function AjustarVista({ pontos }: { pontos: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pontos.length === 0) return;
    if (pontos.length === 1) {
      map.setView(pontos[0], 12);
    } else {
      map.fitBounds(L.latLngBounds(pontos), { padding: [50, 50] });
    }
  }, [map, pontos]);
  return null;
}

export interface DadosMapa {
  origem: { lat: number; lng: number; nome: string };
  destino: { lat: number; lng: number; nome: string };
  atual?: { lat: number; lng: number; quando: string } | null;
  percurso?: { lat: number; lng: number }[];
}

export default function MapaRastreio({
  dados,
  altura = 400,
}: {
  dados: DadosMapa;
  altura?: number;
}) {
  const iconeOrigem = useMemo(() => criarIcone('#0B3C5D', 'A'), []);
  const iconeDestino = useMemo(() => criarIcone('#FF8C42', 'B'), []);
  const iconeCamiao = useMemo(() => criarIcone('#1E88E5', '▲'), []);

  const pontosVista: [number, number][] = [
    [dados.origem.lat, dados.origem.lng],
    [dados.destino.lat, dados.destino.lng],
  ];
  if (dados.atual) pontosVista.push([dados.atual.lat, dados.atual.lng]);

  const linhaPercurso: [number, number][] =
    dados.percurso?.map((p) => [p.lat, p.lng]) ?? [];

  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200"
      style={{ height: altura }}
    >
      <MapContainer
        center={[dados.origem.lat, dados.origem.lng]}
        zoom={7}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={18}
        />

        <AjustarVista pontos={pontosVista} />

        {/* Rota planeada — tracejada, é uma referência, não o percurso real */}
        <Polyline
          positions={[
            [dados.origem.lat, dados.origem.lng],
            [dados.destino.lat, dados.destino.lng],
          ]}
          pathOptions={{ color: '#94A3B8', weight: 2, dashArray: '6 8', opacity: 0.7 }}
        />

        {/* Percurso efetivamente feito */}
        {linhaPercurso.length > 1 && (
          <Polyline
            positions={linhaPercurso}
            pathOptions={{ color: '#1E88E5', weight: 4, opacity: 0.85 }}
          />
        )}

        <Marker position={[dados.origem.lat, dados.origem.lng]} icon={iconeOrigem}>
          <Popup>
            <strong>Recolha</strong>
            <br />
            {dados.origem.nome}
          </Popup>
        </Marker>

        <Marker position={[dados.destino.lat, dados.destino.lng]} icon={iconeDestino}>
          <Popup>
            <strong>Entrega</strong>
            <br />
            {dados.destino.nome}
          </Popup>
        </Marker>

        {dados.atual && (
          <Marker position={[dados.atual.lat, dados.atual.lng]} icon={iconeCamiao}>
            <Popup>
              <strong>Posição atual</strong>
              <br />
              {new Date(dados.atual.quando).toLocaleString('pt-AO')}
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
