/**
 * Corre o fluxo funcional contra uma base reconstruída.
 *
 * Este é o único teste do projecto que precisa de uma base de dados a sério.
 * Os outros lêem ficheiros; este pergunta à base se ela consegue trabalhar.
 *
 * COMO ESCOLHE A BASE
 *
 *   CF_TEST_DSN   se estiver definida, é usada tal como está
 *   caso contrário, tenta o socket local em /tmp/pgrun:55432, base `cf_final`
 *
 * SE NÃO HOUVER BASE
 *
 * Escreve NÃO TESTÁVEL e sai com 0. Não escreve PASS. Um teste que não correu
 * não é um teste que passou, e um pipeline sem PostgreSQL não deve ficar
 * vermelho por causa disso — mas também não deve poder dizer que está verde.
 *
 * Correr: npm run test:reconstruction
 *   ou:   CF_TEST_DSN=postgres://… npm run test:reconstruction
 *
 * Sem DSN, liga-se ao socket local como `postgres` (ajustável em CF_TEST_USER).
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const SQL = join(RAIZ, 'tests/reconstrucao-funcional.sql');

function naoTestavel(porque) {
  console.log('\n  NÃO TESTÁVEL  fluxo funcional sobre base reconstruída');
  console.log(`                ${porque}`);
  console.log('                ver SCHEMA-BASE-RECONSTRUCTION-PLAN.md §6 para montar uma\n');
  process.exit(0);
}

if (!existsSync(SQL)) naoTestavel(`${SQL} não existe`);

// Encontrar um psql utilizável.
let psql = 'psql';
for (const c of ['psql', '/usr/lib/postgresql/16/bin/psql', '/usr/lib/postgresql/17/bin/psql']) {
  try {
    execFileSync(c, ['--version'], { stdio: 'ignore' });
    psql = c;
    break;
  } catch { /* tenta o seguinte */ }
}

const dsn = process.env.CF_TEST_DSN;
const args = dsn
  ? [dsn, '-v', 'ON_ERROR_STOP=0', '-f', SQL]
  : ['-h', '/tmp/pgrun', '-p', '55432',
     // O psql usa o utilizador do sistema por omissão, e não há papel `root`
     // nem `claude` na base de teste. O dono é quem monta a base isolada.
     '-U', process.env.CF_TEST_USER || 'postgres',
     '-d', process.env.CF_TEST_DB || 'cf_final',
     '-v', 'ON_ERROR_STOP=0', '-f', SQL];

let saida;
try {
  saida = execFileSync(psql, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (erro) {
  const detalhe = (erro.stderr || erro.message || '').split('\n')[0];
  naoTestavel(`não foi possível ligar: ${detalhe}`);
}

console.log(saida);

// O psql sai com 0 mesmo quando falha num meta-comando, por isso a decisão sai
// do conteúdo e não do código de saída.
const m = saida.match(/(\d+)\s+PASS,\s+(\d+)\s+FAIL/);
if (!m) {
  console.log('  FALHA  o teste correu mas não devolveu contagem — saída inesperada\n');
  process.exit(1);
}
const [, passes, falhas] = m.map(Number);
console.log(`\n${passes} etapas passaram, ${falhas} falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
