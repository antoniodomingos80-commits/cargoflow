/**
 * Higiene das migrações.
 *
 * Nasceu de um teste de reconstrução numa base PostgreSQL vazia e isolada, a
 * 21/08/2026. Correr as migrações por ordem contra uma base sem nada revelou
 * defeitos que nenhuma leitura do código tinha apanhado — incluindo dois que
 * eram meus.
 *
 * Este teste não substitui a reconstrução real (ver
 * SCHEMA-BASE-RECONSTRUCTION-PLAN.md §6, que explica como a repetir). Apanha
 * as classes de defeito que se detectam sem base de dados nenhuma, e que
 * foram exactamente as que apareceram.
 *
 * Correr: node tests/schema.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
const DIR = 'supabase/migrations';

let falhas = 0;
let passes = 0;
let naoTestaveis = 0;

function verificar(nome, condicao, detalhe = '') {
  if (condicao) {
    passes++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

function naoTestavel(nome, porque) {
  naoTestaveis++;
  console.log(`  NÃO TESTÁVEL  ${nome} — ${porque}`);
}

const ficheiros = readdirSync(join(RAIZ, DIR)).filter((f) => f.endsWith('.sql')).sort();
const conteudo = new Map(
  ficheiros.map((f) => [f, readFileSync(join(RAIZ, DIR, f), 'utf8')]),
);
const bytes = new Map(
  ficheiros.map((f) => [f, readFileSync(join(RAIZ, DIR, f))]),
);

// ---------------------------------------------------------------------------
console.log('\n[1] Cada migração é aplicável pelo psql');
//
// `20260816_trust_layer_minimal.sql` não era: tinha um BOM invisível e escrevia
// `AS \$\ … \$\` em vez de `AS $$ … $$`, como se o ficheiro tivesse passado
// por uma camada de shell antes de ser gravado. O psql lia o `\` no início da
// linha como meta-comando e desistia — e saía com código 0, o que fazia a
// falha passar despercebida a quem só olhasse para o código de saída.
//
// Foi reparado na FASE 7 e já não há nenhuma migração inaplicável. A lista de
// defeitos conhecidos está vazia e é assim que tem de ficar: pode encolher,
// nunca crescer.
//
// O `\$` era o que partia mesmo. O BOM é um cheiro — o psql tolera-o antes de
// um comentário, mas antes de um comando teria partido. Resta um ficheiro com
// BOM, anterior a este trabalho.
const COM_BOM_CONHECIDO = new Set(['20260816_extend_existing.sql']);

for (const f of ficheiros) {
  const buf = bytes.get(f);
  const temBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const dolarEscapado = /\\\$/.test(conteudo.get(f));

  verificar(`${f}: aspas em dólar intactas`, !dolarEscapado, 'tem $ escapado (\\$)');
  if (temBom && !COM_BOM_CONHECIDO.has(f)) {
    verificar(`${f}: sem BOM`, false, 'ficheiro novo com BOM — gravar em UTF-8 sem BOM');
  }
}
verificar(
  `o ficheiro com BOM continua a ser ${COM_BOM_CONHECIDO.size}`,
  [...COM_BOM_CONHECIDO].every((f) => {
    const b = bytes.get(f);
    return b && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
  }),
  'algum foi limpo? então tire-o de COM_BOM_CONHECIDO',
);

// ---------------------------------------------------------------------------
console.log('\n[1b] Nenhuma migração desfaz outra');
//
// A 21/08/2026 um guião de reversão foi gravado dentro de `supabase/migrations/`.
// A pasta é aplicada por ordem alfabética, portanto a reversão corria logo a
// seguir à migração que anulava: a base saiu com 0 de 56 funções endurecidas em
// vez de 55, e o teste de reconstrução não deu um único erro — a reversão é SQL
// perfeitamente válido. Reversões vivem em `supabase/reversoes/` e correm-se à
// mão.
const revNome = ficheiros.filter((f) => /revers|rollback|undo/i.test(f));
verificar('nenhum ficheiro de reversão vive em migrations', revNome.length === 0,
  revNome.join(', '));

const revConteudo = ficheiros.filter((f) => /RESET\s+search_path/i.test(conteudo.get(f)));
verificar('nenhuma migração faz RESET search_path', revConteudo.length === 0,
  `${revConteudo.join(', ')} — repor search_path é reverter, não migrar`);

// ---------------------------------------------------------------------------
console.log('\n[2] A ordem alfabética resolve as dependências');
//
// O prefixo de data não chega: dentro do mesmo dia a ordem é alfabética.
// `20260821_hardening_*` corria ANTES de `20260821_versionar_*`, logo antes
// das funções que altera existirem. Foi por isso renomeado para 20260822.
const criadaEm = new Map();
for (const f of ficheiros) {
  const sql = conteudo.get(f).replace(/^\s*--.*$/gm, '');
  for (const m of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+(?:public\.)?([a-z_]+)/gi)) {
    if (!criadaEm.has(m[1])) criadaEm.set(m[1], f);
  }
}
const foraDeOrdem = [];
for (const f of ficheiros) {
  const sql = conteudo.get(f).replace(/^\s*--.*$/gm, '');
  for (const m of sql.matchAll(/ALTER FUNCTION\s+public\.([a-z_]+)/gi)) {
    const origem = criadaEm.get(m[1]);
    if (origem && origem > f) foraDeOrdem.push(`${f} altera ${m[1]}, criada em ${origem}`);
  }
}
verificar(
  'nenhum ALTER FUNCTION corre antes do CREATE correspondente',
  foraDeOrdem.length === 0,
  foraDeOrdem.join('; '),
);

// ---------------------------------------------------------------------------
console.log('\n[3] Valores de enum usados são criados por alguma migração');
//
// `UNDER_REVIEW` foi acrescentado à produção por comando avulso e nunca posto
// em migração. Numa base vazia, a migração de elegibilidade rebentava com
// `invalid input value for enum verification_status`.
const enumsCriados = new Set();
for (const f of ficheiros) {
  const sql = conteudo.get(f).replace(/^\s*--.*$/gm, '');
  for (const m of sql.matchAll(/ADD VALUE (?:IF NOT EXISTS )?'([A-Z_]+)'/g)) enumsCriados.add(m[1]);
  for (const m of sql.matchAll(/CREATE TYPE[^(]*\(([^)]*)\)/gs)) {
    for (const v of m[1].matchAll(/'([A-Z_]+)'/g)) enumsCriados.add(v[1]);
  }
}
// O modelo base também define enums, fora da pasta de migrações.
try {
  const base = readFileSync(join(RAIZ, '04-MODELO-DE-DADOS.sql'), 'utf8');
  for (const m of base.matchAll(/CREATE TYPE[^(]*\(([^)]*)\)/gs)) {
    for (const v of m[1].matchAll(/'([A-Z_]+)'/g)) enumsCriados.add(v[1]);
  }
} catch {
  naoTestavel('valores de enum do modelo base', '04-MODELO-DE-DADOS.sql não encontrado');
}
verificar(
  "UNDER_REVIEW é criado por uma migração",
  enumsCriados.has('UNDER_REVIEW'),
  'usado em p1_elegibilidade_veiculo e p1_trust_compliance',
);

// ---------------------------------------------------------------------------
console.log('\n[4] Colunas usadas pelas migrações são criadas por alguma delas');
//
// `users.banned` era usada por duas migrações e criada por nenhuma: tinha sido
// acrescentada à produção à mão, e numa base vazia o P0 rebentava. As doze
// colunas órfãs foram versionadas em `20260815_users_colunas_manuais.sql`.
const textoTodo = [...conteudo.values()].join('\n') +
  (() => { try { return readFileSync(join(RAIZ, '04-MODELO-DE-DADOS.sql'), 'utf8'); } catch { return ''; } })();

const COLUNAS_USADAS_PELAS_MIGRACOES = ['banned', 'deleted_at', 'base_city'];
for (const col of COLUNAS_USADAS_PELAS_MIGRACOES) {
  const criada = new RegExp(`ADD COLUMN (?:IF NOT EXISTS )?${col}\\b|^\\s+${col}\\s+(BOOLEAN|TEXT|UUID|TIMESTAMPTZ|VARCHAR)`, 'im')
    .test(textoTodo);
  verificar(`users.${col} é criada por alguma migração`, criada, 'usada mas nunca criada');
}

// ---------------------------------------------------------------------------
console.log('\n[5] Objectos usados que nenhum ficheiro cria');
//
// A reconstrução de 21/08/2026 correu sem um único erro de psql — e mesmo
// assim a base resultante não conseguia publicar uma carga:
//
//   ERROR: null value in column "reference" of relation "loads"
//
// «Nenhuma migração falhou» não é o mesmo que «a base funciona». Os objectos
// abaixo são usados pelo código versionado e criados por ficheiro nenhum. A
// lista é o passivo conhecido a 21/08/2026: tem de encolher, nunca crescer.
// Cada entrada traz uma ISCA: a linha SQL que criaria o objecto. Um teste que
// procura ausências passa quando o padrão está certo E quando está partido — a
// primeira versão destes padrões usava `\y`, que é fronteira de palavra no
// PostgreSQL e o literal «y» em JavaScript, e passava sem olhar para nada. A
// isca fecha essa porta: o padrão tem de a apanhar, senão o teste é cego.
// FASE 8 fechou as duas sequências e os catorze gatilhos. O que resta é a
// carteira e a vista de relatório. Os gatilhos passaram a ter teste próprio,
// com manifesto e ordem de disparo: `tests/paridade-triggers.mjs`.
const EM_FALTA_CONHECIDOS = {
  'TABLE wallet_transactions': [/CREATE TABLE[^;]*\bwallet_transactions\b/i,
    'CREATE TABLE public.wallet_transactions (id uuid);'],
  'TYPE wallet_status': [/CREATE TYPE[^;]*\bwallet_status\b/i,
    "CREATE TYPE wallet_status AS ENUM ('HELD');"],
  'VIEW vw_desvio_entregas': [/CREATE (?:OR REPLACE )?VIEW[^;]*vw_desvio_entregas/i,
    'CREATE OR REPLACE VIEW vw_desvio_entregas AS SELECT 1;'],
};

// O contrário: coisas que a FASE 8 versionou e que não podem voltar a sumir.
// Sem a sequência, `preparar_carga()` chama `nextval` de algo que não existe;
// sem a chamada às partições, `tracking_points` não aceita uma linha.
const JA_VERSIONADOS = {
  'SEQUENCE seq_load_reference': [/CREATE SEQUENCE[^;]*seq_load_reference/i,
    'CREATE SEQUENCE IF NOT EXISTS public.seq_load_reference'],
  'SEQUENCE seq_trip_reference': [/CREATE SEQUENCE[^;]*seq_trip_reference/i,
    'CREATE SEQUENCE IF NOT EXISTS public.seq_trip_reference'],
  'COLUNA loads.confirmed_at': [/ADD COLUMN IF NOT EXISTS confirmed_at/i,
    'ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ'],
  'COLUNA matches.oferta_criada_em': [/ADD COLUMN IF NOT EXISTS oferta_criada_em/i,
    'ADD COLUMN IF NOT EXISTS oferta_criada_em  TIMESTAMPTZ'],
  'arranque das partições de tracking_points': [/criar_particao_tracking\(ano, mes\)/,
    'PERFORM public.criar_particao_tracking(ano, mes);'],
};
for (const [obj, [padrao, isca]] of Object.entries(EM_FALTA_CONHECIDOS)) {
  if (!padrao.test(isca)) {
    verificar(`${obj}: o padrão apanha a própria isca`, false, 'padrão cego — corrigir antes de confiar');
    continue;
  }
  verificar(
    `${obj} continua por versionar (passivo conhecido)`,
    !padrao.test(textoTodo),
    'foi versionado? então tire-o de EM_FALTA_CONHECIDOS',
  );
}

for (const [obj, [padrao, isca]] of Object.entries(JA_VERSIONADOS)) {
  if (!padrao.test(isca)) {
    verificar(`${obj}: o padrão apanha a própria isca`, false, 'padrão cego — corrigir antes de confiar');
    continue;
  }
  verificar(`${obj} continua versionado`, padrao.test(textoTodo), 'desapareceu do repositório');
}

// ---------------------------------------------------------------------------
console.log('\n[6] Divergências entre o repositório e a produção');
//
// Estas não são omissões: são casos em que a produção tem uma política com
// outro nome e outro conteúdo, porque alguém a substituiu à mão. O repositório
// cria `loads_marketplace_read` e `loads_owner_write`; a produção não as tem, e
// tem em vez disso `loads_read`/`loads_insert`/`loads_update`/`loads_delete`,
// que não existem em ficheiro nenhum. Aplicar o repositório a uma base nova dá
// regras de visibilidade do mercado DIFERENTES das que estão em serviço.
//
// Fica registado para não se perder. Só se resolve decidindo qual das duas
// versões é a correcta — e isso é uma decisão de produto, não de teste.
for (const p of ['loads_marketplace_read', 'loads_owner_write', 'trips_marketplace_read', 'trips_owner_write']) {
  verificar(
    `${p} continua a existir só no repositório (divergência conhecida)`,
    new RegExp(`\\b${p}\\b`).test(textoTodo),
    'foi alinhado com a produção? então actualize esta lista',
  );
}

// ---------------------------------------------------------------------------
console.log('\n[7] O que só uma base de dados vazia responde');
naoTestavel(
  'reconstrução completa a partir de zero',
  'tem teste próprio que precisa de base viva: npm run test:reconstruction',
);
naoTestavel(
  'as 37 políticas RLS em falta',
  'só se contam comparando uma base reconstruída com a produção',
);

// ---------------------------------------------------------------------------
console.log(`\n${passes} passaram, ${falhas} falharam, ${naoTestaveis} não testáveis\n`);
process.exit(falhas === 0 ? 0 : 1);
