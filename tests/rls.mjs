/**
 * Isolamento multi-empresa, medido contra uma base de dados a sério.
 *
 * COMO ESTE TESTE SE RECUSA A MENTIR
 *
 * Um `SELECT` que devolve zero linhas não prova isolamento nenhum: pode ser a
 * política a bloquear ou a tabela a estar vazia. Por isso cada sonda conta
 * duas vezes — o que existe (como dono, sem RLS) e o que o papel vê — e uma
 * sonda que não encontra dados declara-se INCONCLUSIVA e conta como falha.
 *
 * O QUE ESTE TESTE NÃO DECIDE
 *
 * A visibilidade do mercado (secções 3 e 5 da matriz) está em aberto e é uma
 * decisão de produto. Aqui só se afere o que não é opinião: uma empresa não lê
 * nem altera os dados de outra, e trocar um UUID não atravessa fronteiras.
 *
 * DÍVIDA CONHECIDA
 *
 * Nenhuma. A lista `FALHAS_CONHECIDAS` está vazia e é assim que deve ficar: se
 * uma sonda voltar a falhar, o teste fica vermelho sem precisar de autorização
 * de ninguém.
 *
 * Correr: npm run test:rls
 *   ou:   CF_TEST_DSN=postgres://… npm run test:rls
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const SEMENTE = join(RAIZ, 'tests/rls-semente.sql');
const MATRIZ = join(RAIZ, 'tests/rls-matriz.sql');

// Sondas que se sabe falharem com as políticas do repositório, a 21/08/2026.
// Cada uma tem de ter uma causa nomeada — não se aceita "é assim".
// Vazia desde 20260826_rls_tabelas_em_falta.sql: `tracking_events` passou a ter
// RLS e as duas sondas que falhavam passaram. Foi o próprio teste a avisar que a
// dívida estava paga — «já não falha, tire-a de FALHAS_CONHECIDAS».
const FALHAS_CONHECIDAS = new Map();
const TOTAL_ESPERADO = 22;

function naoTestavel(porque) {
  console.log('\n  NÃO TESTÁVEL  isolamento multi-empresa');
  console.log(`                ${porque}`);
  console.log('                ver SCHEMA-BASE-RECONSTRUCTION-PLAN.md §6\n');
  process.exit(0);
}

if (!existsSync(SEMENTE) || !existsSync(MATRIZ)) naoTestavel('ficheiros de teste em falta');

let psql = 'psql';
for (const c of ['psql', '/usr/lib/postgresql/16/bin/psql', '/usr/lib/postgresql/17/bin/psql']) {
  try { execFileSync(c, ['--version'], { stdio: 'ignore' }); psql = c; break; } catch { /* segue */ }
}

const dsn = process.env.CF_TEST_DSN;
const base = (ficheiro) => dsn
  ? [dsn, '-v', 'ON_ERROR_STOP=0', '-f', ficheiro]
  : ['-h', '/tmp/pgrun', '-p', '55432',
     '-U', process.env.CF_TEST_USER || 'postgres',
     '-d', process.env.CF_TEST_DB || 'cf_repo',
     '-v', 'ON_ERROR_STOP=0', '-f', ficheiro];

function correr(ficheiro) {
  return execFileSync(psql, base(ficheiro), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

let saida;
try {
  correr(SEMENTE);
  saida = correr(MATRIZ);
} catch (erro) {
  naoTestavel(`não foi possível ligar: ${(erro.stderr || erro.message || '').split('\n')[0]}`);
}

console.log(saida);

const linhas = saida.split('\n');
const falhas = [];
for (const ln of linhas) {
  const p = ln.split('|').map((x) => x.trim());
  if (p.length < 6) continue;
  const [seccao, cenario, , existe, visivel, veredicto] = p;
  if (!/^[49] /.test(seccao)) continue;
  if (/avaliação|proposta/.test(cenario) && seccao.startsWith('9')) continue;
  const bloqueado = veredicto === 'BLOQUEADO' || veredicto.startsWith('ERRO');
  const inconclusivo = existe === '0';
  if (inconclusivo || !bloqueado) falhas.push(`${seccao} · ${cenario}`);
}

console.log('\n=== VEREDICTO ===');
const inesperadas = falhas.filter((f) => !FALHAS_CONHECIDAS.has(f));
const resolvidas = [...FALHAS_CONHECIDAS.keys()].filter((f) => !falhas.includes(f));

for (const f of falhas) {
  const causa = FALHAS_CONHECIDAS.get(f);
  console.log(causa ? `  DÍVIDA CONHECIDA  ${f}\n                    ${causa}` : `  FALHA  ${f}`);
}
for (const f of resolvidas) {
  console.log(`  FALHA  «${f}» já não falha — tire-a de FALHAS_CONHECIDAS`);
}

const passaram = TOTAL_ESPERADO - falhas.length;
console.log(`\n${passaram} de ${TOTAL_ESPERADO} sondas de isolamento passaram · ` +
            `${FALHAS_CONHECIDAS.size} dívida conhecida · ${inesperadas.length} inesperadas · ` +
            `${resolvidas.length} por retirar da lista\n`);

process.exit(inesperadas.length === 0 && resolvidas.length === 0 ? 0 : 1);
