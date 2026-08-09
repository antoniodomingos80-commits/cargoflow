import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarMinhasCargas } from '@/lib/cargas/actions';
import { CartaoCarga } from '@/components/cargas/cartao-carga';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Package, Plus } from 'lucide-react';
import type { Load } from '@/lib/types';

export const metadata = { title: 'As minhas cargas' };

const FILTROS = [
  { valor: 'todas',      rotulo: 'Todas' },
  { valor: 'draft',      rotulo: 'Rascunhos' },
  { valor: 'published',  rotulo: 'Publicadas' },
  { valor: 'in_transit', rotulo: 'Em trânsito' },
  { valor: 'confirmed',  rotulo: 'Concluídas' },
];

export default async function PaginaMinhasCargas({
  searchParams,
}: {
  searchParams: { estado?: string };
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const estado = searchParams.estado ?? 'todas';
  const cargas = (await listarMinhasCargas(estado)) as unknown as Load[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-600">As minhas cargas</h1>
          <p className="mt-1 text-sm text-slate-500">
            {cargas.length === 0
              ? 'Ainda não publicou nenhuma carga.'
              : `${cargas.length} ${cargas.length === 1 ? 'carga' : 'cargas'}`}
          </p>
        </div>
        <Link href="/cargas/nova">
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Publicar carga
          </Button>
        </Link>
      </header>

      {/* Filtros por estado */}
      <nav className="flex flex-wrap gap-2" aria-label="Filtrar por estado">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={f.valor === 'todas' ? '/cargas' : `/cargas?estado=${f.valor}`}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              estado === f.valor
                ? 'bg-navy-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100',
            )}
          >
            {f.rotulo}
          </Link>
        ))}
      </nav>

      {cargas.length === 0 ? (
        <EmptyState
          icone={Package}
          titulo={
            estado === 'todas'
              ? 'Nenhuma carga ainda'
              : 'Nenhuma carga neste estado'
          }
          texto={
            estado === 'todas'
              ? 'Publique a sua primeira carga e os transportadores que passam na sua rota serão notificados.'
              : 'Experimente outro filtro para ver as suas cargas.'
          }
          accao={
            estado === 'todas'
              ? { href: '/cargas/nova', rotulo: 'Publicar primeira carga' }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {cargas.map((carga) => (
            <CartaoCarga key={carga.id} carga={carga} />
          ))}
        </div>
      )}
    </div>
  );
}
