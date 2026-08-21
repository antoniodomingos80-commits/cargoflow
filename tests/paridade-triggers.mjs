/**
 * Paridade dos gatilhos entre o repositório e a produção.
 *
 * PORQUE ESTE TESTE EXISTE
 *
 * Uma função versionada não é um gatilho versionado. Durante meses as 51
 * funções `cf_*` estiveram no repositório com paridade MD5 provada, e a base
 * que o repositório reconstruía não conseguia publicar uma carga: a função
 * `preparar_carga()` existia e ninguém a chamava.
 *
 * A produção tem 27 gatilhos (26 em `public`, 1 em `auth`). Antes da FASE 8 o
 * repositório criava 13. Este teste tranca os 27.
 *
 * O QUE ISTO NÃO FAZ
 *
 * Não liga à base de dados — os testes correm sem credenciais. A comparação
 * contra a produção foi feita com `md5(pg_get_triggerdef(oid))` dos dois lados,
 * a 21/08/2026: 27 de 27 idênticos. Este teste garante que o lado do
 * repositório continua a ser aquilo que foi comparado.
 *
 * Para a verificação viva contra uma base reconstruída, ver
 * `tests/reconstrucao-funcional.sql`.
 *
 * SE ESTE TESTE FALHAR
 *
 * Não altere o manifesto para o fazer passar. Ou a alteração ao ficheiro foi
 * indevida — e reverte-se — ou o gatilho mudou mesmo em produção, e então
 * reextrai-se com `pg_get_triggerdef` e actualiza-se o manifesto no mesmo
 * commit em que se explica porquê.
 *
 * Correr: node tests/paridade-triggers.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();

let falhas = 0;
let passes = 0;

function verificar(nome, condicao, detalhe = '') {
  if (condicao) {
    passes++;
    console.log(`  PASS  ${nome}`);
  } else {
    falhas++;
    console.log(`  FALHA ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

/**
 * Os 27 gatilhos da produção a 21/08/2026, tal como `pg_get_triggerdef` os
 * devolve. `colunas` só existe onde a produção usa `UPDATE OF` — e aí a lista
 * é significativa: tirar uma coluna muda quando o gatilho dispara.
 */
const ESPERADOS = {
  // --- rastreio do relógio -------------------------------------------------
  trg_loads_updated:              { tabela: 'loads',        timing: 'BEFORE', eventos: ['UPDATE'], fn: 'set_updated_at' },
  trg_trips_updated:              { tabela: 'trips',        timing: 'BEFORE', eventos: ['UPDATE'], fn: 'set_updated_at' },
  trg_users_updated:              { tabela: 'users',        timing: 'BEFORE', eventos: ['UPDATE'], fn: 'set_updated_at' },
  trg_documents_updated:          { tabela: 'documents',    timing: 'BEFORE', eventos: ['UPDATE'], fn: 'set_updated_at' },
  trg_drivers_updated:            { tabela: 'drivers',      timing: 'BEFORE', eventos: ['UPDATE'], fn: 'set_updated_at' },
  trg_tenants_updated:            { tabela: 'tenants',      timing: 'BEFORE', eventos: ['UPDATE'], fn: 'set_updated_at' },
  trg_vehicles_updated:           { tabela: 'vehicles',     timing: 'BEFORE', eventos: ['UPDATE'], fn: 'set_updated_at' },
  trg_user_blocklist_updated_at:  { tabela: 'user_blocklist', timing: 'BEFORE', eventos: ['UPDATE'], fn: 'set_updated_at' },
  trg_payments_updated_at:        { tabela: 'payments',     timing: 'BEFORE', eventos: ['UPDATE'], fn: 'set_payments_updated_at' },

  // --- preparação de linhas ------------------------------------------------
  // A assimetria é da produção: carga é INSERT OR UPDATE, viagem só INSERT.
  trg_preparar_carga:             { tabela: 'loads', timing: 'BEFORE', eventos: ['INSERT', 'UPDATE'], fn: 'preparar_carga' },
  trg_preparar_viagem:            { tabela: 'trips', timing: 'BEFORE', eventos: ['INSERT'],           fn: 'preparar_viagem' },
  trg_load_confirmed_at:          { tabela: 'loads', timing: 'BEFORE', eventos: ['UPDATE'],           fn: 'cf_trigger_load_confirmed_at' },

  // --- correspondências ----------------------------------------------------
  trg_matches_carga: {
    tabela: 'loads', timing: 'AFTER', eventos: ['INSERT', 'UPDATE'], fn: 'cf_trigger_matches_carga',
    colunas: ['status', 'origin_id', 'destination_id', 'weight_kg', 'volume_m3', 'pickup_from',
              'pickup_until', 'delivery_deadline', 'requires_refrigeration', 'required_vehicle_type'],
  },
  trg_matches_viagem: {
    tabela: 'trips', timing: 'AFTER', eventos: ['INSERT', 'UPDATE'], fn: 'cf_trigger_matches_viagem',
    colunas: ['status', 'available_weight_kg', 'available_volume_m3', 'origin_id', 'destination_id',
              'vehicle_id', 'departure_at', 'estimated_arrival', 'is_return_trip'],
  },
  trg_match_resultado_oferta:     { tabela: 'offers',     timing: 'AFTER', eventos: ['INSERT'], fn: 'cf_trigger_match_resultado_oferta' },
  trg_match_resultado_acordo:     { tabela: 'agreements', timing: 'AFTER', eventos: ['INSERT'], fn: 'cf_trigger_match_resultado_acordo' },

  // --- negócio -------------------------------------------------------------
  trg_apos_criar_proposta:        { tabela: 'offers',   timing: 'AFTER', eventos: ['INSERT'], fn: 'cf_apos_criar_proposta' },
  trg_notificar_mensagem:         { tabela: 'messages', timing: 'AFTER', eventos: ['INSERT'], fn: 'cf_notificar_mensagem' },
  trg_reviews_recalculate:        { tabela: 'reviews',  timing: 'AFTER', eventos: ['INSERT'], fn: 'recalculate_user_rating' },
  trg_wallet_release:             { tabela: 'loads',    timing: 'AFTER', eventos: ['UPDATE'], fn: 'cf_trigger_wallet_release' },

  // --- protecções, com prefixo zz_ para dispararem em último ---------------
  zz_trips_veiculo_elegivel:      { tabela: 'trips', timing: 'BEFORE', eventos: ['UPDATE'], fn: 'cf_trips_veiculo_elegivel' },

  // --- ligação ao Supabase Auth -------------------------------------------
  on_auth_user_created:           { tabela: 'users', esquema: 'auth', timing: 'AFTER', eventos: ['INSERT'], fn: 'handle_new_auth_user' },
};

// `zz_proteger_campos_admin` repete-se em cinco tabelas com o mesmo nome. É
// legítimo: nomes de gatilho são únicos por tabela, não por base.
const BLINDAGEM = ['users', 'documents', 'vehicles', 'tenants', 'drivers'];

// ---------------------------------------------------------------------------
// Ler tudo o que o repositório cria
// ---------------------------------------------------------------------------
const DIR = 'supabase/migrations';
const fontes = readdirSync(join(RAIZ, DIR))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => [`${DIR}/${f}`, readFileSync(join(RAIZ, DIR, f), 'utf8')]);
try {
  fontes.unshift(['04-MODELO-DE-DADOS.sql', readFileSync(join(RAIZ, '04-MODELO-DE-DADOS.sql'), 'utf8')]);
} catch { /* medido abaixo */ }

// Os comentários citam SQL a explicar-se — se não forem tirados, o teste lê
// gatilhos que não existem.
const semComentarios = (sql) => sql.replace(/^\s*--.*$/gm, '');

const PADRAO = /CREATE\s+(?:OR REPLACE\s+)?TRIGGER\s+(\w+)\s+(BEFORE|AFTER|INSTEAD OF)\s+([\s\S]*?)\s+ON\s+(?:(\w+)\.)?(\w+)\b[\s\S]*?EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?(\w+)\s*\(/gi;

const encontrados = [];
for (const [ficheiro, sql] of fontes) {
  for (const m of semComentarios(sql).matchAll(PADRAO)) {
    const clausula = m[3];
    encontrados.push({
      nome: m[1],
      timing: m[2].toUpperCase(),
      eventos: [...new Set([...clausula.matchAll(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/gi)].map((e) => e[1].toUpperCase()))],
      colunas: (clausula.match(/UPDATE\s+OF\s+([\s\S]*?)$/i)?.[1] ?? '')
        .split(',').map((c) => c.trim()).filter((c) => /^\w+$/.test(c)),
      esquema: (m[4] ?? 'public').toLowerCase(),
      tabela: m[5],
      fn: m[6],
      ficheiro,
    });
  }
}

// ---------------------------------------------------------------------------
console.log('\n[1] Inventário');
verificar(
  'leram-se gatilhos das migrações e do modelo base',
  encontrados.length >= 27,
  `encontrados ${encontrados.length}`,
);

// ---------------------------------------------------------------------------
console.log('\n[2] Todos os gatilhos da produção são criados pelo repositório');
for (const [nome, e] of Object.entries(ESPERADOS)) {
  const achado = encontrados.find((t) => t.nome === nome && t.tabela === e.tabela);
  if (!achado) {
    verificar(`${e.tabela}.${nome}`, false, 'nenhuma migração o cria');
    continue;
  }
  const problemas = [];
  if (achado.timing !== e.timing) problemas.push(`timing ${achado.timing} ≠ ${e.timing}`);
  if (achado.esquema !== (e.esquema ?? 'public')) problemas.push(`esquema ${achado.esquema} ≠ ${e.esquema ?? 'public'}`);
  if (achado.fn !== e.fn) problemas.push(`função ${achado.fn} ≠ ${e.fn}`);
  const evA = [...achado.eventos].sort().join('+');
  const evE = [...e.eventos].sort().join('+');
  if (evA !== evE) problemas.push(`eventos ${evA} ≠ ${evE}`);
  if (e.colunas) {
    const cA = achado.colunas.join(',');
    const cE = e.colunas.join(',');
    if (cA !== cE) problemas.push(`colunas de UPDATE OF diferentes: ${cA || '(nenhuma)'}`);
  } else if (achado.colunas.length) {
    problemas.push(`tem UPDATE OF e a produção não: ${achado.colunas.join(',')}`);
  }
  verificar(`${e.tabela}.${nome}`, problemas.length === 0, problemas.join('; '));
}

console.log('\n[2b] A blindagem administrativa cobre as cinco tabelas');
for (const tab of BLINDAGEM) {
  verificar(
    `${tab}.zz_proteger_campos_admin`,
    encontrados.some((t) => t.nome === 'zz_proteger_campos_admin' && t.tabela === tab
      && t.timing === 'BEFORE' && t.fn === 'cf_proteger_campos_administrativos'),
    'em falta ou com timing/função diferentes',
  );
}

// ---------------------------------------------------------------------------
console.log('\n[3] O repositório não cria gatilhos que a produção não tem');
const permitidos = new Set([...Object.keys(ESPERADOS), 'zz_proteger_campos_admin']);
const intrusos = encontrados.filter((t) => !permitidos.has(t.nome));
verificar(
  'nenhum gatilho fora do manifesto',
  intrusos.length === 0,
  intrusos.map((t) => `${t.nome} em ${t.ficheiro}`).join('; '),
);

// ---------------------------------------------------------------------------
console.log('\n[4] Ordem de disparo onde há mais do que um gatilho');
//
// O PostgreSQL dispara por ordem alfabética do nome dentro do mesmo tempo e
// evento. O prefixo `zz_` não é decoração: garante que a blindagem e a
// elegibilidade correm DEPOIS de tudo o que possa alterar a linha. Se alguém
// renomear um gatilho para algo que ordene depois de `zz_`, a protecção deixa
// de ser a última — e nada rebenta, o que é o pior tipo de defeito.
const porTabelaTiming = new Map();
for (const t of encontrados) {
  for (const ev of t.eventos) {
    const chave = `${t.esquema}.${t.tabela}|${t.timing}|${ev}`;
    if (!porTabelaTiming.has(chave)) porTabelaTiming.set(chave, []);
    porTabelaTiming.get(chave).push(t.nome);
  }
}
let gruposComOrdem = 0;
for (const [chave, nomes] of [...porTabelaTiming].sort()) {
  if (nomes.length < 2) continue;
  gruposComOrdem++;
  const ordenados = [...nomes].sort();
  const protecoes = ordenados.filter((n) => n.startsWith('zz_'));
  const outros = ordenados.filter((n) => !n.startsWith('zz_'));
  console.log(`        ${chave}: ${ordenados.join(' → ')}`);
  if (protecoes.length) {
    verificar(
      `${chave}: as protecções zz_ disparam em último`,
      outros.every((o) => protecoes.every((p) => o < p)),
      'um gatilho ordena depois de uma protecção zz_',
    );
  }
}
verificar('há grupos com ordem a verificar', gruposComOrdem > 0, 'nenhum grupo encontrado — o parser falhou?');

// ---------------------------------------------------------------------------
console.log(`\n${passes} passaram, ${falhas} falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
