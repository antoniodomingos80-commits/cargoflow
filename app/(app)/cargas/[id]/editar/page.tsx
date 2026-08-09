import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { obterCarga, listarLocalidades } from '@/lib/cargas/actions';
import { FormularioCarga, type CargaEditavel } from '../../nova/formulario';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Editar carga' };

const ESTADOS_EDITAVEIS = ['DRAFT', 'PUBLISHED', 'NEGOTIATING'];

export default async function PaginaEditarCarga({
  params,
}: {
  params: { id: string };
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const carga = (await obterCarga(params.id)) as any;
  if (!carga) notFound();
  if (carga.tenant_id !== perfil.tenant.id) notFound();

  if (!ESTADOS_EDITAVEIS.includes(carga.status)) {
    redirect(`/cargas/${params.id}`);
  }

  const localidades = await listarLocalidades();

  const editavel: CargaEditavel = {
    id: carga.id,
    title: carga.title,
    description: carga.description,
    origin_id: carga.origin_id,
    destination_id: carga.destination_id,
    cargo_type: carga.cargo_type,
    weight_kg: carga.weight_kg,
    volume_m3: carga.volume_m3,
    required_vehicle_type: carga.required_vehicle_type,
    pickup_from: carga.pickup_from,
    pickup_until: carga.pickup_until,
    delivery_deadline: carga.delivery_deadline,
    is_urgent: carga.is_urgent,
    budget_amount: carga.budget_amount,
    status: carga.status,
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/cargas/${params.id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar à carga
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-bold text-navy-600">Editar carga</h1>
        <p className="mt-1 text-sm text-slate-500">{carga.reference}</p>
      </header>

      <FormularioCarga
        localidades={localidades as any}
        verificado={perfil.user.verification === 'APPROVED'}
        carga={editavel}
      />
    </div>
  );
}
