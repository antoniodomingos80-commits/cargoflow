/**
 * Teste de contrato da barreira de bloqueio (P0).
 *
 * O que este teste É: uma verificação estática de que toda a operação de
 * negócio protegida chama a barreira ANTES de qualquer mutação, e uma
 * verificação da tabela de verdade da própria barreira.
 *
 * O que este teste NÃO É: um teste de integração. Não abre sessão nem chama
 * Server Actions. Os cenários que exigem sessão real estão no guião de
 * produção — ver GAP-REPORT e o relatório do P0.
 *
 * Correr: node tests/seguranca-bloqueio.mjs
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

// ---------------------------------------------------------------------------
// 1. Tabela de verdade da barreira
// ---------------------------------------------------------------------------
// Réplica exacta da regra em lib/seguranca/conta.ts. Se a regra lá mudar e esta
// não, os casos abaixo deixam de bater certo e o teste denuncia a divergência.
const fonte = readFileSync(join(RAIZ, 'lib/seguranca/conta.ts'), 'utf8');

console.log('\n[1] Regra de bloqueio');
verificar(
  'a barreira considera is_blocked',
  /u\.is_blocked === true/.test(fonte),
);
verificar(
  'a barreira considera banned (legado)',
  /u\.banned === true/.test(fonte),
);
verificar(
  'a barreira considera is_active falso',
  /u\.is_active === false/.test(fonte),
);
verificar(
  'a mensagem de erro não revela o motivo do bloqueio',
  !/blocked_reason|ban_reason/.test(fonte),
);

// ---------------------------------------------------------------------------
// 2. Cobertura: operações que têm de estar protegidas
// ---------------------------------------------------------------------------
const OPERACOES = [
  ['lib/cargas/actions.ts', ['criarCarga', 'editarCarga', 'publicarCarga', 'cancelarCarga']],
  ['lib/propostas/actions.ts', ['enviarProposta', 'enviarPropostaParaViagem', 'aceitarProposta', 'rejeitarProposta', 'retirarProposta', 'contrapropor']],
  ['lib/viagens/actions.ts', ['criarViagem', 'editarViagem', 'cancelarViagem']],
  ['lib/entrega/actions.ts', ['registarEntrega', 'confirmarRececao', 'avaliar', 'criarBackhaul']],
  ['lib/frota/actions.ts', ['criarVeiculo', 'desativarVeiculo']],
  ['lib/mensagens/actions.ts', ['enviarMensagem']],
  ['lib/wallet/actions.ts', ['pedirLevantamento']],
];

console.log('\n[2] Operações protegidas pela barreira');
for (const [ficheiro, funcoes] of OPERACOES) {
  const texto = readFileSync(join(RAIZ, ficheiro), 'utf8');
  const linhas = texto.split('\n');

  for (const fn of funcoes) {
    const inicio = linhas.findIndex((l) => l.startsWith(`export async function ${fn}(`));
    if (inicio === -1) {
      verificar(`${fn} existe em ${ficheiro}`, false, 'função não encontrada');
      continue;
    }

    // Fim da função: próxima declaração de topo.
    let fim = linhas.length;
    for (let i = inicio + 1; i < linhas.length; i++) {
      if (linhas[i].startsWith('export ') || linhas[i].startsWith('async function ')) {
        fim = i;
        break;
      }
    }
    const corpo = linhas.slice(inicio, fim);

    const iGuard = corpo.findIndex((l) => l.includes('garantirContaAtiva(perfil)'));
    const iMutacao = corpo.findIndex((l) =>
      /\.(insert|update|delete|upsert|rpc)\(/.test(l) || /storage\s*$/.test(l),
    );

    verificar(
      `${fn} chama a barreira`,
      iGuard !== -1,
      'sem garantirContaAtiva',
    );
    if (iGuard !== -1 && iMutacao !== -1) {
      verificar(
        `${fn} chama a barreira ANTES da mutação`,
        iGuard < iMutacao,
        `barreira na linha relativa ${iGuard}, mutação na ${iMutacao}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Pagamentos — barreira própria (redirect / erro estruturado)
// ---------------------------------------------------------------------------
console.log('\n[3] Pagamentos');
const pag = readFileSync(join(RAIZ, 'lib/pagamentos/actions.ts'), 'utf8');
verificar('iniciarPagamentoStripe verifica bloqueio', /contaBloqueada\(perfil\)/.test(pag));
// Comparar dentro de cada função de mutação, não no ficheiro inteiro: as
// funções de leitura no topo também têm o gate de verification.
for (const fn of ['iniciarPagamentoStripe', 'gerarReferenciaMulticaixa']) {
  const inicio = pag.indexOf(`export async function ${fn}(`);
  const seguinte = pag.indexOf('export async function ', inicio + 10);
  const corpo = pag.slice(inicio, seguinte === -1 ? undefined : seguinte);
  const iBloqueio = corpo.indexOf('contaBloqueada(perfil)');
  const iVerif = corpo.indexOf("verification !== 'APPROVED'");
  verificar(
    `${fn}: bloqueio verificado antes da verificação`,
    iBloqueio !== -1 && iVerif !== -1 && iBloqueio < iVerif,
    `bloqueio=${iBloqueio}, verificacao=${iVerif}`,
  );
}
verificar(
  'existem dois pontos de pagamento protegidos',
  (pag.match(/contaBloqueada\(perfil\)/g) ?? []).length >= 2,
);

// ---------------------------------------------------------------------------
// 4. Gate de verificação preservado
// ---------------------------------------------------------------------------
console.log('\n[4] O gate de verificação existente não foi removido');
const GATES = [
  ['lib/cargas/actions.ts', 3],
  ['lib/propostas/actions.ts', 3],
  ['lib/viagens/actions.ts', 1],
  ['lib/pagamentos/actions.ts', 4],
];
for (const [ficheiro, minimo] of GATES) {
  const texto = readFileSync(join(RAIZ, ficheiro), 'utf8');
  const n = (texto.match(/verification !== 'APPROVED'/g) ?? []).length;
  verificar(`${ficheiro}: ${n} gate(s) de verificação (mínimo ${minimo})`, n >= minimo);
}

// ---------------------------------------------------------------------------
// 5. Sincronização dos três mecanismos
// ---------------------------------------------------------------------------
console.log('\n[5] Fonte de verdade e estado refletido');
const trust = readFileSync(join(RAIZ, 'lib/trust/actions.ts'), 'utf8');
verificar('blockUser escreve em user_blocklist', /from\('user_blocklist'\)\s*\.insert/.test(trust.replace(/\n\s*/g, ' ')));
verificar('blockUser reflete is_blocked em users', /is_blocked: true/.test(trust));
verificar('blockUser mantém banned em sincronia', /banned: true/.test(trust));
verificar('unblockUser limpa is_blocked', /is_blocked: false/.test(trust));

const legado = readFileSync(join(RAIZ, 'lib/admin/utilizadores.ts'), 'utf8');
verificar('suspenderUtilizador escreve na blocklist', /from\('user_blocklist'\)/.test(legado));
verificar('suspenderUtilizador reflete is_blocked', /is_blocked: true/.test(legado));
verificar('ativarUtilizador levanta o bloqueio na blocklist', /unblocked_at/.test(legado));

// ---------------------------------------------------------------------------
// 6. decidirVerificacao — âmbito documental
// ---------------------------------------------------------------------------
console.log('\n[6] decidirVerificacao');
const admin = readFileSync(join(RAIZ, 'lib/admin/actions.ts'), 'utf8');
const blocoDecidir = admin.slice(
  admin.indexOf('export async function decidirVerificacao'),
  admin.indexOf('export async function documentosDoTenant'),
);
verificar('já não actualiza documentos só por tenant_id', !/\.from\('documents'\)[\s\S]*?\.eq\('tenant_id'[^)]*\)\s*;/.test(blocoDecidir));
verificar('restringe por lista explícita de ids', /\.in\('id', ids\)/.test(blocoDecidir));
verificar('restringe ao estado PENDING', /\.eq\('verification', 'PENDING'\)/.test(blocoDecidir));
verificar('restringe ao tenant do utilizador', /\.eq\('tenant_id', utilizador\.tenant_id\)/.test(blocoDecidir));
verificar('preenche verification_date', /verification_date: agora/.test(blocoDecidir));
verificar('preenche verified_by', /verified_by: admin\.user\.id/.test(blocoDecidir));
verificar('regista em verification_audit_log', /verification_audit_log/.test(blocoDecidir));

// ---------------------------------------------------------------------------
// 7. Superfície pública: operações privilegiadas fora das Server Actions
// ---------------------------------------------------------------------------
// A directiva só conta se for a primeira instrução do ficheiro. Procurar a
// string em qualquer sítio apanharia menções dentro de comentários.
function declaraUseServer(texto) {
  const semComentarios = texto
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return /^\s*['"]use server['"]\s*;/.test(semComentarios);
}

console.log('\n[7] Superfície de Server Actions');

const pagActions = readFileSync(join(RAIZ, 'lib/pagamentos/actions.ts'), 'utf8');
verificar(
  'atualizarPagamentoInterno já não é exportada de um ficheiro use server',
  !pagActions.includes('export async function atualizarPagamentoInterno'),
);
const recon = readFileSync(join(RAIZ, 'lib/pagamentos/reconciliacao.ts'), 'utf8');
verificar('reconciliacao.ts não declara use server', !declaraUseServer(recon));
verificar('reconciliacao.ts mantém a função', recon.includes('export async function atualizarPagamentoInterno'));
for (const rota of ['app/api/stripe/webhook/route.ts', 'app/api/multicaixa/callback/route.ts']) {
  const t = readFileSync(join(RAIZ, rota), 'utf8');
  verificar(`${rota} importa da reconciliação`, t.includes("@/lib/pagamentos/reconciliacao"));
}

const matchActions = readFileSync(join(RAIZ, 'lib/matching/actions.ts'), 'utf8');
verificar(
  'notificarMatchesDeCarga já não é Server Action',
  !matchActions.includes('export async function notificarMatchesDeCarga'),
);
verificar(
  'notificarMatchesDeViagem já não é Server Action',
  !matchActions.includes('export async function notificarMatchesDeViagem'),
);
const notif = readFileSync(join(RAIZ, 'lib/matching/notificacoes.ts'), 'utf8');
verificar('notificacoes.ts não declara use server', !declaraUseServer(notif));

const corresp = readFileSync(join(RAIZ, 'lib/correspondencias/actions.ts'), 'utf8');
verificar('convidarTransportador chama a barreira', corresp.includes('garantirContaAtiva(perfil)'));

// ---------------------------------------------------------------------------
console.log(`\n${passes} passaram, ${falhas} falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
