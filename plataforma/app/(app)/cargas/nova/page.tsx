import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarLocalidades } from '@/lib/cargas/actions';
import { FormularioCarga } from './formulario';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'Publicar carga' };

export default async function PaginaNovaCarga() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  // Camionistas individuais não publicam cargas — publicam viagens.
  if (perfil.user.role === 'CARRIER' || perfil.user.role === 'COMPANY_STAFF') {
    redirect('/mercado/cargas');
  }

  const localidades = await listarLocalidades();

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/cargas"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        As minhas cargas
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-bold text-navy-600">Publicar carga</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quanto mais completa a informação, melhores as propostas que recebe.
        </p>
      </header>

      <FormularioCarga
        localidades={localidades as any}
        verificado={perfil.user.verification === 'APPROVED'}
      />
    </div>
  );
}
