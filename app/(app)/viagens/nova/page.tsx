import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarLocalidades } from '@/lib/cargas/actions';
import { listarVeiculosDisponiveis } from '@/lib/frota/actions';
import { FormularioViagem } from './formulario';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, Truck } from 'lucide-react';

export const metadata = { title: 'Publicar viagem' };

export default async function PaginaNovaViagem() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  if (perfil.user.role === 'MERCHANT') redirect('/mercado/viagens');

  const [localidades, veiculos] = await Promise.all([
    listarLocalidades(),
    listarVeiculosDisponiveis(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/viagens"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        As minhas viagens
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-bold text-navy-600">Publicar viagem</h1>
        <p className="mt-1 text-sm text-slate-500">
          Anuncie a rota e o espaço livre — o sistema procura carga compatível.
        </p>
      </header>

      {veiculos.length === 0 ? (
        <EmptyState
          icone={Truck}
          titulo="Registe primeiro um veículo"
          texto="Uma viagem precisa de estar associada a um camião. Registe o seu veículo e volte aqui."
          accao={{ href: '/frota/novo', rotulo: 'Registar veículo' }}
        />
      ) : (
        <FormularioViagem
          localidades={localidades as any}
          veiculos={veiculos}
        />
      )}
    </div>
  );
}
