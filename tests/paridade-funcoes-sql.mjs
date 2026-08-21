/**
 * Paridade entre o SQL versionado e a base de dados de produção.
 *
 * As duas migrações de 21 de Agosto de 2026 não escrevem funcionalidade nova:
 * são cópias literais do que corre em produção, extraídas com
 * `pg_get_functiondef(oid)`. O seu valor está inteiro em serem LITERAIS. Uma
 * "melhoria" bem-intencionada num destes corpos — reindentar, corrigir a
 * ortografia de `cf_confirmar_receccao`, arrumar um comentário, normalizar os
 * CRLF que dois gatilhos de matching têm no corpo — desfaz silenciosamente a
 * única prova de que o repositório representa a produção.
 *
 * Este teste tranca isso para as 51 funções, guardando de cada uma o MD5, a
 * assinatura e o contexto de segurança tal como estavam a 21/08/2026.
 *
 * O QUE ISTO NÃO FAZ
 *
 * Não liga à base de dados — os testes correm sem credenciais. A comparação
 * contra a produção foi feita no momento da extração, com
 * `md5(pg_get_functiondef(oid))` do lado da base de dados: 22/22 e 29/29
 * idênticas. Este teste garante que o lado do repositório continua a ser
 * aquilo que foi comparado.
 *
 * SE ESTE TESTE FALHAR
 *
 * Não altere o valor esperado para o fazer passar. Ou a alteração ao ficheiro
 * foi indevida — e reverte-se — ou a função mudou mesmo em produção, e então o
 * caminho é reextrair com `pg_get_functiondef` e actualizar o manifesto no
 * mesmo commit em que se explica porquê.
 *
 * Correr: node tests/paridade-funcoes-sql.mjs
 */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
 * O estado de cada função em produção a 21/08/2026: o MD5 da definição
 * completa, a assinatura, e o contexto de segurança que tem de ser
 * preservado.
 */
const RASTREIO = {
  calcular_distancia_km: { md5: '2f3bedb2e363b53190b82f4ef37bfdd3', args: 'origem uuid, destino uuid',
    definer: false, searchPath: true, podeOperar: false, admin: false },
  cf_avaliacoes_da_carga: { md5: '9db6d7629f0e5c7365cfcab337ed4764', args: 'p_load_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_avaliar: { md5: 'fbe2a9aaac6b99dcccbef302784a8b63', args: 'p_load_id uuid, p_rating smallint, p_pontualidade smallint DEFAULT NULL::smallint, p_comunicacao smallint DEFAULT NULL::smallint, p_estado_carga smallint DEFAULT NULL::smallint, p_profissional smallint DEFAULT NULL::smallint, p_comentario text DEFAULT NULL::text',
    definer: true, searchPath: true, podeOperar: true, admin: false },
  cf_confirmar_receccao: { md5: 'd5d60a742cbdc6986748863ac5e5ad84', args: 'p_load_id uuid',
    definer: true, searchPath: true, podeOperar: true, admin: true },
  cf_estado_rastreamento: { md5: 'a0170602039437c78f555a31c6e7526e', args: 'p_load_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_garantir_particoes_futuras: { md5: '5506d171f538ff216cf2cd41c90a020e', args: '',
    definer: false, searchPath: true, podeOperar: false, admin: false },
  cf_percurso: { md5: 'd3b5ab16b85aa840cb24b0b69bdc4238', args: 'p_trip_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_prova_entrega: { md5: 'e153a601706a2bf5fcdb26ed1d1e72f4', args: 'p_load_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_raio_tolerancia_m: { md5: 'd4612978e89a9e89a8a989b9ac664767', args: '',
    definer: false, searchPath: true, podeOperar: false, admin: false },
  cf_registar_entrega: { md5: '61894031c5289af36882ce1424c4201e', args: 'p_load_id uuid, p_recebido_por text, p_assinatura text DEFAULT NULL::text, p_fotos text[] DEFAULT \'{}\'::text[], p_notas text DEFAULT NULL::text, p_tem_danos boolean DEFAULT false, p_danos_desc text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision',
    definer: true, searchPath: true, podeOperar: true, admin: true },
  cf_registar_evento: { md5: 'c92f4d91ce365a009c99a07a247e2818', args: 'p_load_id uuid, p_tipo text, p_descricao text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision',
    definer: true, searchPath: true, podeOperar: true, admin: true },
  cf_registar_posicoes: { md5: 'cca6744e4d1e2160d2cb7ba54c859d6f', args: 'p_trip_id uuid, p_pontos jsonb',
    definer: true, searchPath: true, podeOperar: true, admin: true },
  cf_transporto_esta_carga: { md5: 'afe85084505a15f00436792bbf1a19c5', args: 'p_trip_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  criar_particao_tracking: { md5: '922525d22b2955531985be2ffca263fb', args: 'ano integer, mes integer',
    definer: false, searchPath: true, podeOperar: false, admin: true },
  current_app_user_id: { md5: 'e516c842a14e1697d50502a564ca13c6', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  gerar_referencia: { md5: '8fb7c0d91d73b78d522661c00913cca7', args: 'prefixo text, seq_nome text',
    definer: false, searchPath: true, podeOperar: false, admin: false },
  handle_new_auth_user: { md5: 'd8f6e5d6ef13c974eb4f781ed7a25145', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  is_verified_user: { md5: '19faa3b99a9c7c2a08fd0a3e851affff', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  preparar_carga: { md5: 'c7e73cd1f42672cc77379eae904b7b33', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  preparar_viagem: { md5: '90cf4de7d4539a23b8417224fb88846a', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  recalculate_user_rating: { md5: '62fd761a1fd0c334c995dc9285ed6601', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  unaccent_simples: { md5: '9b7dc1671b24440dcffe7daa92f1aa43', args: 'texto text',
    definer: false, searchPath: true, podeOperar: false, admin: false },
};

const NEGOCIO = {
  cf_aceitar_proposta: { md5: '4018d1980c139d66ddea285a7f5240c9', args: 'p_offer_id uuid',
    definer: true, searchPath: true, podeOperar: true, admin: true },
  cf_admin_decidir_verificacao: { md5: 'e1cb006c2324ad7fe14ff8af993bf806', args: 'p_user_id uuid, p_aprovar boolean, p_motivo text DEFAULT NULL::text',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_admin_indicadores: { md5: '3ef70b288803154ace5d5ed78f10bc67', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_admin_operacoes: { md5: 'bf38603ef4bc23333a748c79ac5d1008', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_admin_verificacoes_pendentes: { md5: '16123671cd454fd6790e38ab2b05d988', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_apos_criar_proposta: { md5: '6598f7c1b001f60f30876753a53e0e18', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_calcular_matches_carga: { md5: 'd8f087ce3bb4ea6e44157e6b814474f5', args: 'p_load_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_calcular_matches_viagem: { md5: '098bd146e021683e38ccdcb5f6c037ad', args: 'p_trip_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_contrapropor_proposta: { md5: 'bdf9f2a6cadd68622c88d818a657e427', args: 'p_offer_id uuid, p_novo_valor numeric, p_mensagem text DEFAULT NULL::text',
    definer: true, searchPath: true, podeOperar: true, admin: true },
  cf_convidar_transportador: { md5: '902525ab09c6f2f8aa333bd546054798', args: 'p_load_id uuid, p_trip_id uuid, p_mensagem text DEFAULT NULL::text',
    definer: true, searchPath: true, podeOperar: true, admin: true },
  cf_correspondencias_da_carga: { md5: '9c1a89afa124e7da5f75e611dca35d82', args: 'p_load_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_correspondencias_da_viagem: { md5: '7be12ead4e48d6a6e3ad09dcb46a04f4', args: 'p_trip_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_expirar_anuncios: { md5: '16e3d0a4fb66c6cb6aec426b6367ab62', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_marcar_lida: { md5: 'fce205e24a5c12332a7ed117a8df952a', args: 'p_conversation_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_mensagens_da_conversa: { md5: 'bf284b4f5fe9b7182d3a056f178fd86c', args: 'p_conversation_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_minhas_conversas: { md5: '9bc119beb19dd39ef7cd449c2a3ae7f0', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_notificar_mensagem: { md5: 'ff2d621054bc58bda73f5ea013bdb598', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_pontuar_correspondencia: { md5: '85aa5067622224cb3705e6b0a75c8fb0', args: 'p_load_id uuid, p_trip_id uuid',
    definer: false, searchPath: true, podeOperar: false, admin: false },
  cf_propostas_da_carga: { md5: 'e92121f90f9927191ca951502aafd852', args: 'p_load_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: true },
  cf_rejeitar_proposta: { md5: '8bf4939211b2549d494b3d401f9841c9', args: 'p_offer_id uuid, p_motivo text DEFAULT NULL::text',
    definer: true, searchPath: true, podeOperar: true, admin: true },
  cf_tenho_proposta_na_carga: { md5: '48790bb8e69c3f5fde6728673dbe0646', args: 'p_load_id uuid',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_trigger_load_confirmed_at: { md5: '92d966a1009c435d823b4d9b68a9875e', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_trigger_match_resultado_acordo: { md5: '80add8819af14f57547138c71f0d5caa', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_trigger_match_resultado_oferta: { md5: 'be6cb22cfbe43c57fe606ef7ad1988d9', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_trigger_matches_carga: { md5: '64802008faf66b4be213d1fa1bb33754', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_trigger_matches_viagem: { md5: '220633c0f313fbbf652d9a8086d05fdb', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_trigger_wallet_hold: { md5: '7c44e1389a7dff2c9548803dc9312cd7', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_trigger_wallet_release: { md5: 'c30c56de081f4e2a73f965bab38045a9', args: '',
    definer: true, searchPath: true, podeOperar: false, admin: false },
  cf_viagem_por_partir: { md5: '35bb8332e251e95063d75c4809081598', args: 'p_departure timestamp with time zone',
    definer: false, searchPath: false, podeOperar: false, admin: false },
};

// As dez auxiliares saíram do ficheiro de rastreio na FASE 7, para um ficheiro
// com data anterior: `20260821_p1_trust_compliance.sql` precisa de
// `current_app_user_id()` e, dentro do mesmo dia, «p1» ordena antes de
// «versionar». O grupo continua a ser um só — mudou apenas onde mora.
const FICHEIROS = [
  [
    [
      'supabase/migrations/20260812_funcoes_auxiliares.sql',
      'supabase/migrations/20260821_versionar_funcoes_rastreio.sql',
    ],
    RASTREIO,
    'rastreio e entrega',
  ],
  [['supabase/migrations/20260821_versionar_funcoes_negocio.sql'], NEGOCIO, 'negócio'],
];

/** Extrai cada bloco. O `\n` final faz parte do que `pg_get_functiondef` devolve. */
function lerBlocos(caminhos) {
  const sql = caminhos.map((c) => readFileSync(join(RAIZ, c), 'utf8')).join('\n');
  const mapa = new Map();
  for (const m of sql.matchAll(
    /(CREATE OR REPLACE FUNCTION public\.([a-z_]+)\([\s\S]*?\$function\$\n);\n/g,
  )) {
    mapa.set(m[2], m[1]);
  }
  return { sql, blocos: mapa };
}

const tudo = new Map();

for (const [caminhos, esperado, rotulo] of FICHEIROS) {
  const { sql, blocos } = lerBlocos(caminhos);
  for (const [n, c] of blocos) tudo.set(n, c);
  const nomes = Object.keys(esperado);

  console.log(`\n[${rotulo}] Cobertura`);
  verificar(
    `o ficheiro tem as ${nomes.length} funções extraídas`,
    blocos.size === nomes.length,
    `encontradas ${blocos.size}`,
  );
  for (const n of nomes) {
    if (!blocos.has(n)) verificar(`${n} está no ficheiro`, false, 'bloco não encontrado');
  }

  console.log(`\n[${rotulo}] Paridade byte a byte com a produção de 21/08/2026`);
  for (const [n, e] of Object.entries(esperado)) {
    const c = blocos.get(n);
    if (!c) continue;
    const md5 = createHash('md5').update(c, 'utf8').digest('hex');
    verificar(n, md5 === e.md5, `ficheiro=${md5} esperado=${e.md5}`);
  }

  console.log(`\n[${rotulo}] Assinatura`);
  for (const [n, e] of Object.entries(esperado)) {
    const c = blocos.get(n) ?? '';
    const m = c.match(/CREATE OR REPLACE FUNCTION public\.[a-z_]+\(([^)]*)\)/s);
    const args = m ? m[1].split(/\s+/).join(' ').trim() : '<sem correspondência>';
    verificar(`${n}(${e.args})`, args === e.args, `no ficheiro: ${args}`);
  }

  console.log(`\n[${rotulo}] Contexto de segurança`);
  for (const [n, e] of Object.entries(esperado)) {
    const c = blocos.get(n) ?? '';
    verificar(
      `${n}: SECURITY DEFINER ${e.definer ? 'presente' : 'ausente'}`,
      /SECURITY DEFINER/.test(c) === e.definer,
    );
    verificar(
      `${n}: search_path ${e.searchPath ? 'fixo' : 'não fixo (como em produção)'}`,
      /SET search_path TO 'public'/.test(c) === e.searchPath,
    );
  }

  console.log(`\n[${rotulo}] Guardas preservadas`);
  for (const [n, e] of Object.entries(esperado)) {
    if (!e.podeOperar && !e.admin) continue;
    const c = blocos.get(n) ?? '';
    if (e.podeOperar) {
      verificar(
        `${n} verifica pode_operar() antes de escrever`,
        /IF NOT public\.pode_operar\(\) THEN[\s\S]{0,200}ERRCODE = '42501'/.test(c),
      );
    }
    if (e.admin) {
      verificar(`${n} verifica is_platform_admin()`, /is_platform_admin\(\)/.test(c));
    }
  }

  console.log(`\n[${rotulo}] Nada foi "arrumado" durante a extração`);
  verificar('a migração declara-se como cópia literal', /pg_get_functiondef/.test(sql));
  // Sem os comentários: a auditoria no fim do ficheiro cita `CREATE FUNCTION`
  // ao explicar o problema do IMMUTABLE em cf_viagem_por_partir, e isso não é
  // SQL executável.
  const executavel = sql.replace(/^\s*--.*$/gm, '');
  verificar(
    'usa CREATE OR REPLACE, portanto é idempotente',
    !/\bCREATE FUNCTION\b/.test(executavel),
  );
}

// ---------------------------------------------------------------------------
console.log('\n[global] O conjunto fecha');
verificar(
  'as 51 funções estão versionadas sem repetições',
  tudo.size === Object.keys(RASTREIO).length + Object.keys(NEGOCIO).length,
  `distintas=${tudo.size}`,
);
verificar(
  'nenhuma função do P0/P1 é redefinida nestes ficheiros',
  !['cf_trust_score', 'cf_veiculo_elegivel', 'cf_expirar_documentos', 'pode_operar',
    'is_platform_admin', 'current_tenant_id', 'cf_proteger_campos_administrativos']
    .some((n) => tudo.has(n)),
);
verificar(
  'o erro de ortografia de cf_confirmar_receccao foi preservado',
  tudo.has('cf_confirmar_receccao'),
);
verificar(
  'os CRLF dos gatilhos de matching foram preservados',
  (tudo.get('cf_trigger_match_resultado_oferta') ?? '').includes('\r\n') &&
    (tudo.get('cf_trigger_match_resultado_acordo') ?? '').includes('\r\n'),
);

// ---------------------------------------------------------------------------
console.log(`\n${passes} passaram, ${falhas} falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
