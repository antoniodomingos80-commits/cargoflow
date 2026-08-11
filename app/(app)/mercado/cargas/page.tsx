import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarMercadoCargas, listarLocalidades } from '@/lib/cargas/actions';
import { CartaoCarga } from '@/components/cargas/cartao-carga';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { CARGO_TYPE_LABELS, type Load, type CFLocation } from '@/lib/types';
import { Search, SlidersHorizontal, X } from 'lucide-react';

export const metadata = { title: 'Cargas disponíveis' };

export default async function PaginaMercadoCargas({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string; destino?: string; tipo?: string; pesoMax?: string }>;
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const filtros = await searchParams;

  const [cargasRaw, localidadesRaw] = await Promise.all([
    listarMercadoCargas(filtros),
    listarLocalidades(),
  ]);
  const cargas = cargasRaw as unknown as Load[];
  const localidades = localidadesRaw as unknown as CFLocation[];

  const temFiltros = Boolean(
    filtros.origem || filtros.destino || filtros.tipo || filtros.pesoMax,
  );
  const cargasUrgentes = cargas.filter((carga) => carga.is_urgent).length;
  const cargasRetorno = cargas.filter((carga) => carga.is_return_trip === true).length;
  const cargasRefrigeradas = cargas.filter((carga) => carga.requires_refrigeration).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">Cargas disponíveis</h1>
        <p className="mt-1 text-sm text-slate-500">
          Encontre carga para as suas rotas — incluindo o percurso de retorno.
        </p>
      </header>

      {/* Filtros */}
      <form className="cf-card p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-navy-600">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filtrar
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            name="origem"
            defaultValue={filtros.origem ?? ''}
            aria-label="Origem"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Qualquer origem</option>
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          <select
            name="destino"
            defaultValue={filtros.destino ?? ''}
            aria-label="Destino"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Qualquer destino</option>
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          <select
            name="tipo"
            defaultValue={filtros.tipo ?? ''}
            aria-label="Tipo de carga"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Qualquer tipo</option>
            {Object.entries(CARGO_TYPE_LABELS).map(([v, rotulo]) => (
              <option key={v} value={v}>{rotulo}</option>
            ))}
          </select>

          <input
            name="pesoMax"
            type="number"
            min={0}
            step={100}
            defaultValue={filtros.pesoMax ?? ''}
            placeholder="Peso máx. (kg)"
            aria-label="Peso máximo em quilogramas"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" size="sm">
            <Search className="h-4 w-4" aria-hidden="true" />
            Procurar
          </Button>
          {temFiltros && (
            <Link
              href="/mercado/cargas"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-600"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Limpar
            </Link>
          )}
        </div>
      </form>

      {cargas.length > 0 && (
        <div className="rounded-2xl border border-brand-100 bg-brand-50/70 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-brand-700">
            <span className="font-semibold">Oportunidades destacadas</span>
            {cargasUrgentes > 0 && <span className="rounded-full bg-white px-2.5 py-1">{cargasUrgentes} urgentes</span>}
            {cargasRetorno > 0 && <span className="rounded-full bg-white px-2.5 py-1">{cargasRetorno} com retorno</span>}
            {cargasRefrigeradas > 0 && <span className="rounded-full bg-white px-2.5 py-1">{cargasRefrigeradas} refrigeradas</span>}
          </div>
        </div>
      )}

      <p className="text-sm text-slate-500">
        {cargas.length === 0
          ? 'Nenhuma carga corresponde aos critérios.'
          : `${cargas.length} ${cargas.length === 1 ? 'carga disponível' : 'cargas disponíveis'}`}
      </p>

      {cargas.length === 0 ? (
        <EmptyState
          icone={Search}
          titulo={temFiltros ? 'Sem resultados' : 'Ainda não há cargas publicadas'}
          texto={
            temFiltros
              ? 'Experimente alargar os critérios — por exemplo, remover o filtro de destino.'
              : 'A plataforma está a arrancar. Publique as suas viagens para ser notificado assim que surgir carga compatível.'
          }
          accao={
            temFiltros
              ? { href: '/mercado/cargas', rotulo: 'Limpar filtros' }
              : { href: '/viagens/nova', rotulo: 'Publicar viagem' }
          }
        />
      ) : (
        <div className="space-y-3">
          {cargas.map((carga) => (
            <CartaoCarga key={carga.id} carga={carga} contexto="mercado" />
          ))}
        </div>
      )}
    </div>
  );
}
