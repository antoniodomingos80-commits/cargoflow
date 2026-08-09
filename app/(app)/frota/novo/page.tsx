import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { FormularioVeiculo } from './formulario';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Adicionar veículo' };

export default async function PaginaNovoVeiculo() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  if (perfil.user.role === 'MERCHANT') redirect('/painel');

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/frota"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Frota
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-bold text-navy-600">Adicionar veículo</h1>
        <p className="mt-1 text-sm text-slate-500">
          A capacidade é usada para encontrar cargas que cabem no seu camião.
        </p>
      </header>

      <FormularioVeiculo />
    </div>
  );
}
