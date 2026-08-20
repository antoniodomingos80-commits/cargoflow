'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Fronteira de erro da área autenticada.
 *
 * Regra desta página: o utilizador nunca vê o texto do erro. Uma mensagem de
 * RLS ("new row violates row-level security policy…"), um erro de RPC ou o
 * texto de `ContaBloqueadaError` revelam a forma do modelo de dados e das
 * regras de segurança. Aqui há uma frase legível; o detalhe fica na consola
 * do servidor, onde é útil e não é público.
 *
 * Isto não altera nenhuma verificação de segurança — só o que se mostra
 * quando uma delas dispara.
 */
export default function ErroAplicacao({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // O `digest` é o identificador que o Next atribui ao erro no servidor.
    // É o que permite encontrar o registo completo nos logs sem o expor.
    console.error('Erro na aplicação:', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-600">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </span>

      <h1 className="mt-6 text-2xl font-bold text-navy-600">
        Alguma coisa não correu bem
      </h1>

      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        Não foi possível concluir esta operação. Pode voltar a tentar — se o
        problema se repetir, contacte o suporte da CargoFlow e indique o código
        abaixo.
      </p>

      {error.digest ? (
        <p className="mt-4 rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-500">
          {error.digest}
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset} size="sm">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Tentar de novo
        </Button>
        <Link href="/painel">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao painel
          </Button>
        </Link>
      </div>
    </div>
  );
}
