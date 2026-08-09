import Link from 'next/link';
import { Button } from './button';

/**
 * Estado vazio.
 *
 * Um marketplace novo está vazio quase sempre — este componente é usado
 * frequentemente e deve dizer ao utilizador o que fazer a seguir, nunca
 * limitar-se a informar que não há nada.
 */
export function EmptyState({
  icone: Icone,
  titulo,
  texto,
  accao,
}: {
  icone: any;
  titulo: string;
  texto: string;
  accao?: { href: string; rotulo: string };
}) {
  return (
    <div className="cf-card flex flex-col items-center px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icone className="h-7 w-7" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-lg font-semibold text-navy-600">{titulo}</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">{texto}</p>
      {accao && (
        <Link href={accao.href} className="mt-6">
          <Button>{accao.rotulo}</Button>
        </Link>
      )}
    </div>
  );
}
