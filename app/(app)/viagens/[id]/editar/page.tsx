import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { obterViagem } from '@/lib/viagens/actions';
import { listarLocalidades } from '@/lib/cargas/actions';
import { listarVeiculosDisponiveis } from '@/lib/frota/actions';
import { FormularioViagem, type ViagemEditavel } from '../../nova/formulario';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Editar viagem' };

const ESTADOS_EDITAVEIS = ['PUBLISHED', 'PARTIALLY_BOOKED', 'FULL'];

export default async function PaginaEditarViagem({
  params,
}: {
  params: { id: string };
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const viagem = (await obterViagem(params.id)) as any;
  if (!viagem) notFound();

  // Só o dono edita. O RLS já limita a escrita, mas não vale a pena mostrar
  // um formulário que nunca poderia ser gravado.
  if (viagem.tenant_id !== perfil.tenant.id) notFound();

  if (!ESTADOS_EDITAVEIS.includes(viagem.status)) {
    redirect(`/viagens/${params.id}`);
  }

  const [localidades, veiculos] = await Promise.all([
    listarLocalidades(),
    listarVeiculosDisponiveis(),
  ]);

  // O veículo desta viagem pode já não constar dos "disponíveis" — tem de
  // continuar a aparecer na lista, senão o formulário perde-o ao gravar.
  const listaVeiculos = (veiculos as any[]).some((v) => v.id === viagem.vehicle_id)
    ? (veiculos as any[])
    : [viagem.vehicle, ...(veiculos as any[])].filter(Boolean);

  const editavel: ViagemEditavel = {
    id: viagem.id,
    vehicle_id: viagem.vehicle_id,
    origin_id: viagem.origin_id,
    destination_id: viagem.destination_id,
    available_weight_kg: viagem.available_weight_kg,
    available_volume_m3: viagem.available_volume_m3,
    departure_at: viagem.departure_at,
    estimated_arrival: viagem.estimated_arrival,
    minimum_price: viagem.minimum_price,
    is_return_trip: viagem.is_return_trip,
    status: viagem.status,
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/viagens/${params.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar à viagem
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-bold text-navy-600">Editar viagem</h1>
        <p className="mt-1 text-sm text-slate-500">
          {viagem.reference}
        </p>
      </header>

      <FormularioViagem
        localidades={localidades as any}
        veiculos={listaVeiculos as any}
        viagem={editavel}
      />
    </div>
  );
}
