/**
 * Resolve o alias `@/` quando os testes importam módulos da aplicação.
 *
 * O `tsconfig` mapeia `@/*` para a raiz do projecto, mas isso é uma convenção
 * do TypeScript e do bundler — o Node não sabe nada dela. Sem este resolvedor,
 * `node --experimental-strip-types` rebenta com `Cannot find package '@/lib'`
 * assim que um módulo testado importa outro.
 *
 * Também acrescenta a extensão: o código da aplicação escreve
 * `from '@/lib/types'`, sem `.ts`, porque é o bundler que a resolve.
 */
import { existsSync } from 'node:fs';

const RAIZ = new URL('../', import.meta.url);

export async function resolve(especificador, contexto, seguinte) {
  if (!especificador.startsWith('@/')) {
    return seguinte(especificador, contexto);
  }

  const base = new URL(especificador.slice(2), RAIZ);

  for (const sufixo of ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts']) {
    const candidato = new URL(base.href + sufixo);
    if (existsSync(candidato)) {
      return seguinte(candidato.href, contexto);
    }
  }

  return seguinte(base.href, contexto);
}
