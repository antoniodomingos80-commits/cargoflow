/**
 * Auditoria automática das funções SQL.
 *
 * As migrações de 21/08/2026 provaram, por MD5, que o SQL do repositório é
 * byte a byte o que corre em produção. Isso torna possível uma coisa que antes
 * não era: auditar a segurança da base de dados lendo ficheiros, sem
 * credenciais e sem rede.
 *
 * Este teste não descreve o que gostaríamos que fosse verdade — descreve o que
 * É verdade hoje, incluindo o que ainda está mal. As listas de excepções
 * conhecidas existem para isso: são uma catraca. Uma função nova que repita um
 * problema já documentado faz o teste falhar, porque não está na lista. Fechar
 * um problema significa apagar nomes da lista, nunca acrescentá-los sem uma
 * razão escrita.
 *
 * Correr: node tests/sql-security.mjs
 */

import { readFileSync } from 'node:fs';
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

const FICHEIROS = [
  'supabase/migrations/20260812_funcoes_auxiliares.sql',
  'supabase/migrations/20260821_versionar_funcoes_rastreio.sql',
  'supabase/migrations/20260821_versionar_funcoes_negocio.sql',
  'supabase/migrations/20260821_p1_trust_compliance.sql',
  'supabase/migrations/20260821_p1_blindagem_campos_administrativos.sql',
  'supabase/migrations/20260821_p1_elegibilidade_veiculo.sql',
  'supabase/migrations/20260822_hardening_funcoes_sql.sql',
  'supabase/migrations/20260822_hardening_pg_temp.sql',
];

/** Corpo de cada função, sem comentários de linha (que citam SQL a explicar). */
const funcoes = new Map();
for (const f of FICHEIROS) {
  const sql = readFileSync(join(RAIZ, f), 'utf8').replace(/^\s*--.*$/gm, '');
  // As migrações de preservação usam `$function$` (é o que o
  // `pg_get_functiondef` emite); as escritas à mão no P0/P1 usam `$$`.
  for (const m of sql.matchAll(
    /CREATE OR REPLACE FUNCTION public\.([a-z_]+)\s*\(([\s\S]*?)\)\s*\n?\s*RETURNS([\s\S]*?)(\$function\$|\$\$)([\s\S]*?)\4/g,
  )) {
    // A última definição de cada nome ganha: é assim que o Postgres se comporta
    // ao aplicar as migrações por ordem, e o hardening vem depois.
    funcoes.set(m[1], { cabecalho: m[3], corpo: m[5], tudo: m[0] });
  }
}

console.log(`\n[0] Inventário`);
verificar(`leram-se funções dos ${FICHEIROS.length} ficheiros`, funcoes.size >= 55, `${funcoes.size} funções`);

const definer = [...funcoes].filter(([, f]) => /SECURITY DEFINER/.test(f.cabecalho));
const escrevem = [...funcoes].filter(([, f]) =>
  /(INSERT INTO|UPDATE\s+[a-z_]|DELETE FROM)/i.test(f.corpo),
);

// ---------------------------------------------------------------------------
console.log('\n[1] SECURITY DEFINER fixa o search_path');
// `cf_viagem_por_partir` estava fora desta regra e foi corrigida no hardening.
for (const [nome, f] of definer) {
  verificar(`${nome}`, /SET search_path TO 'public'/.test(f.cabecalho));
}

// ---------------------------------------------------------------------------
console.log('\n[2] Nenhuma SECURITY DEFINER exposta ao precedente de `pg_temp`');
//
// A REGRA, aplicada estruturalmente — sem lista de excepções.
//
// O Postgres pesquisa o esquema temporário ANTES de todos os outros para
// nomes de relação, e continua a fazê-lo com `SET search_path TO 'public'`.
// Uma SECURITY DEFINER com `FROM users` sem esquema resolve para
// `pg_temp.users` se essa tabela existir na sessão de quem chama.
//
// Provado em produção a 21/08 em transação revertida: `current_app_user_id()`
// devolveu um id forjado, e `cf_minhas_conversas()` devolveu 0 conversas em
// vez das 5 reais.
//
// Duas defesas são aceites, e só duas:
//   (a) `pg_temp` nomeado explicitamente no fim do search_path — assim é
//       pesquisado nessa posição em vez de primeiro, e `public` ganha;
//   (b) todas as referências a relações qualificadas com `public.`.
//
// Uma função SECURITY DEFINER nova que não tenha nenhuma das duas faz este
// teste falhar. Não há lista onde a inscrever.
const TABELAS = [
  'users', 'loads', 'trips', 'offers', 'agreements', 'reviews', 'documents',
  'vehicles', 'tenants', 'messages', 'conversations', 'conversation_participants',
  'notifications', 'matches', 'tracking_points', 'tracking_events',
  'proof_of_delivery', 'wallet_transactions', 'drivers', 'shipment_photos',
  'locations', 'payments', 'audit_logs', 'verification_requirements',
  'verification_audit_log', 'user_blocklist', 'vehicle_compliance',
];
const REF = new RegExp(
  `(?:FROM|JOIN|UPDATE|INSERT INTO|DELETE FROM)\\s+(public\\.)?(${TABELAS.join('|')})\\b`,
  'gi',
);

// Defesa (a) pode vir da declaração da função ou de um `ALTER FUNCTION` numa
// migração de hardening posterior. As duas contam — é o estado final da base
// de dados que importa, não onde a linha foi escrita.
const protegidasPorAlter = new Set();
for (const f of FICHEIROS) {
  const sql = readFileSync(join(RAIZ, f), 'utf8').replace(/^\s*--.*$/gm, '');
  for (const m of sql.matchAll(
    /ALTER FUNCTION\s+public\.([a-z_]+)\s*\([^)]*\)\s*SET search_path TO 'public',\s*'pg_temp'/g,
  )) {
    protegidasPorAlter.add(m[1]);
  }
}

const expostas = [];
for (const [nome, f] of definer) {
  const refs = [...f.corpo.matchAll(REF)];
  if (refs.length === 0) continue;

  const naoQualificadas = [...new Set(refs.filter((m) => !m[1]).map((m) => m[2]))];
  const temPgTemp =
    /SET search_path TO 'public', 'pg_temp'/.test(f.cabecalho) || protegidasPorAlter.has(nome);

  const protegida = temPgTemp || naoQualificadas.length === 0;
  verificar(
    `${nome}${temPgTemp ? ' (pg_temp em último)' : ' (tudo qualificado)'}`,
    protegida,
    `refere sem esquema: ${naoQualificadas.join(', ')}`,
  );
  if (!protegida) expostas.push(nome);
}
verificar('zero funções SECURITY DEFINER expostas', expostas.length === 0, expostas.join(', '));

// ---------------------------------------------------------------------------
console.log('\n[3] Funções que escrevem têm autorização explícita');
// Gatilhos não validam quem chama: quem valida é a política RLS da tabela que
// os dispara. Corrê-los directamente não é possível.
const GATILHOS = new Set([
  'cf_apos_criar_proposta', 'cf_notificar_mensagem', 'cf_trigger_wallet_hold',
  'cf_trigger_wallet_release', 'cf_trigger_load_confirmed_at',
  'cf_trigger_matches_carga', 'cf_trigger_matches_viagem',
  'cf_trigger_match_resultado_oferta', 'cf_trigger_match_resultado_acordo',
  'cf_proteger_campos_administrativos', 'cf_trips_veiculo_elegivel',
  'preparar_carga', 'preparar_viagem', 'recalculate_user_rating',
  'handle_new_auth_user', 'set_updated_at',
]);
// Fechadas por permissão: `authenticated` não tem EXECUTE (verificado em
// produção a 21/08). A protecção está no GRANT, não no corpo.
const FECHADAS_POR_GRANT = new Set([
  'cf_calcular_matches_carga', 'cf_calcular_matches_viagem',
  'cf_expirar_documentos', 'cf_recalcular_trust_score',
  'cf_recalcular_trust_scores', 'cf_registar_auditoria_trust',
  'criar_particao_tracking', 'cf_garantir_particoes_futuras',
]);

for (const [nome, f] of escrevem) {
  if (GATILHOS.has(nome) || FECHADAS_POR_GRANT.has(nome)) continue;
  const autoriza =
    /current_tenant_id\(\)/.test(f.corpo) ||
    /is_platform_admin\(\)/.test(f.corpo) ||
    /current_app_user_id\(\)/.test(f.corpo) ||
    /pode_operar\(\)/.test(f.corpo);
  verificar(`${nome} verifica quem chama antes de escrever`, autoriza);
}

// ---------------------------------------------------------------------------
console.log('\n[4] Mutações operacionais respeitam pode_operar()');
const EXIGEM_P0 = [
  'cf_aceitar_proposta', 'cf_rejeitar_proposta', 'cf_contrapropor_proposta',
  'cf_convidar_transportador', 'cf_registar_posicoes', 'cf_registar_evento',
  'cf_registar_entrega', 'cf_confirmar_receccao', 'cf_avaliar',
];
for (const nome of EXIGEM_P0) {
  const f = funcoes.get(nome);
  verificar(
    `${nome} recusa contas bloqueadas com 42501`,
    !!f && /IF NOT public\.pode_operar\(\) THEN[\s\S]{0,200}ERRCODE = '42501'/.test(f.corpo),
  );
}

// ---------------------------------------------------------------------------
console.log('\n[5] Funções administrativas exigem PLATFORM_ADMIN');
for (const nome of ['cf_admin_indicadores', 'cf_admin_operacoes',
  'cf_admin_verificacoes_pendentes', 'cf_admin_decidir_verificacao', 'cf_expirar_anuncios']) {
  const f = funcoes.get(nome);
  verificar(
    `${nome} falha fechada sem is_platform_admin()`,
    !!f && /IF NOT is_platform_admin\(\) THEN\s*(RETURN|RAISE)/.test(f.corpo),
  );
}

// ---------------------------------------------------------------------------
console.log('\n[6] Leituras SECURITY DEFINER não atravessam empresas');
// Cada uma recebe um id de fora e devolve dados. Todas têm de confirmar que
// quem pergunta tem relação com esse id. `cf_avaliacoes_da_carga` foi a que
// faltava e foi corrigida no hardening.
for (const nome of ['cf_percurso', 'cf_estado_rastreamento', 'cf_prova_entrega',
  'cf_avaliacoes_da_carga', 'cf_correspondencias_da_carga',
  'cf_correspondencias_da_viagem', 'cf_propostas_da_carga']) {
  const f = funcoes.get(nome);
  verificar(
    `${nome} verifica a empresa de quem pergunta`,
    !!f && /current_tenant_id\(\)/.test(f.corpo),
  );
}
for (const nome of ['cf_mensagens_da_conversa', 'cf_minhas_conversas', 'cf_marcar_lida']) {
  const f = funcoes.get(nome);
  verificar(
    `${nome} verifica participação na conversa`,
    !!f && /current_app_user_id\(\)/.test(f.corpo),
  );
}

// ---------------------------------------------------------------------------
console.log('\n[7] Volatilidade honesta');
// IMMUTABLE promete o mesmo resultado para sempre. Quem lê o relógio ou a base
// de dados não pode prometer isso — o planeador pode pré-calcular a chamada.
for (const [nome, f] of funcoes) {
  if (!/\bIMMUTABLE\b/.test(f.cabecalho)) continue;
  verificar(
    `${nome}: IMMUTABLE sem depender de tempo nem de tabelas`,
    !/\b(NOW\(\)|CURRENT_DATE|CURRENT_TIMESTAMP|clock_timestamp)\b/i.test(f.corpo) &&
      !/\bFROM\s+[a-z_]+/i.test(f.corpo),
    'usa NOW(), CURRENT_DATE ou lê tabelas',
  );
}

// ---------------------------------------------------------------------------
console.log('\n[8] Privilégios: nada crítico aberto ao anónimo');
// Instantâneo dos privilégios de produção a 21/08/2026, já com o hardening
// aplicado. `anon` só pode executar auxiliares que devolvem NULL sem sessão,
// e gatilhos, que não são chamáveis fora do seu contexto.
const ANON_PODE_EXECUTAR = new Set([
  'current_app_user_id', 'current_tenant_id', 'current_user_id',
  'is_platform_admin', 'pode_operar', 'calcular_distancia_km',
  'escrita_administrativa_permitida', 'cf_tenho_proposta_na_carga',
  'cf_transporto_esta_carga', 'cf_trust_score_autorizado', 'cf_veiculo_elegivel',
  'cf_trigger_wallet_hold', 'cf_trigger_wallet_release',
  'cf_trigger_load_confirmed_at', 'cf_trigger_match_resultado_oferta',
  'cf_trigger_match_resultado_acordo', 'cf_proteger_campos_administrativos',
  'cf_trips_veiculo_elegivel',
]);
const NUNCA_PARA_ANON = [
  'cf_aceitar_proposta', 'cf_rejeitar_proposta', 'cf_contrapropor_proposta',
  'cf_convidar_transportador', 'cf_registar_posicoes', 'cf_registar_entrega',
  'cf_confirmar_receccao', 'cf_avaliar', 'cf_admin_decidir_verificacao',
  'cf_expirar_anuncios', 'cf_expirar_documentos', 'cf_trust_score',
  'cf_viagem_por_partir',
];
for (const nome of NUNCA_PARA_ANON) {
  verificar(`${nome} está fora do alcance do anónimo`, !ANON_PODE_EXECUTAR.has(nome));
}
verificar(
  'cf_viagem_por_partir deixou de estar aberta ao anónimo',
  /REVOKE EXECUTE ON FUNCTION public\.cf_viagem_por_partir[\s\S]{0,120}FROM PUBLIC/.test(
    readFileSync(join(RAIZ, 'supabase/migrations/20260822_hardening_funcoes_sql.sql'), 'utf8'),
  ),
);
verificar(
  'o REVOKE é a PUBLIC e não só ao papel (senão não tira nada)',
  !/REVOKE EXECUTE[^\n]*FROM anon;/.test(
    readFileSync(join(RAIZ, 'supabase/migrations/20260822_hardening_funcoes_sql.sql'), 'utf8')
      .replace(/^\s*--.*$/gm, ''),
  ),
);

// ---------------------------------------------------------------------------
console.log(`\n${passes} passaram, ${falhas} falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
