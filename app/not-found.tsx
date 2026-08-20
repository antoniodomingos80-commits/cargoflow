import Link from 'next/link';
import { MapPinOff, ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Página não encontrada' };

/**
 * 404 da aplicação.
 *
 * Substitui a página branca do Next, que aparecia em inglês e sem qualquer
 * ligação de saída.
 */
export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <Logo />

      <span className="mt-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <MapPinOff className="h-7 w-7" aria-hidden="true" />
      </span>

      <h1 className="mt-6 text-2xl font-bold text-navy-600">Página não encontrada</h1>

      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-600">
        Esta rota não existe, ou o que procurava já não está aqui. Verifique o
        endereço ou volte ao início.
      </p>

      <Link href="/painel" className="mt-8">
        <Button size="sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar ao painel
        </Button>
      </Link>
    </main>
  );
}
