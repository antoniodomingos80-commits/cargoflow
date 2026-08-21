/**
 * Testes do motor de pontuação de confiança.
 *
 * `lib/trust/score.ts` é uma função pura, por isso pode ser exercida caso a
 * caso sem base de dados nenhuma. É o que se faz aqui.
 *
 * A última secção é a mais importante e a menos óbvia: compara os PESOS da
 * implementação em TypeScript com os da implementação em SQL. Existem duas
 * porque a tarefa nocturna corre dentro da base de dados e não tem Node — e
 * duas cópias da mesma regra divergem sempre, a menos que algo verifique.
 * Este teste é esse algo.
 *
 * Correr: node --experimental-strip-types tests/trust-score.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const { calcularTrustScore, PESOS } = await import(
  join(RAIZ, 'lib/trust/score.ts')
);

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

/** Conta sem nada: identidade e empresa por verificar, mais nada. */
function base(sobreposicao = {}) {
  return {
    identidade: 'PENDING',
    empresa: 'PENDING',
    documentosExigidos: [],
    documentosValidos: [],
    aplicaFrota: false,
    veiculosTotal: 0,
    veiculosConformes: 0,
    acordosTotal: 0,
    acordosConcluidos: 0,
    avaliacoesTotal: 0,
    avaliacaoMedia: null,
    ...sobreposicao,
  };
}

const fator = (r, chave) => r.fatores.find((f) => f.chave === chave);

// ---------------------------------------------------------------------------
console.log('\n[1] Dados completos');
// Tudo verificado, tudo conforme, tudo concluído, 5 estrelas → 100.
{
  const r = calcularTrustScore(
    base({
      identidade: 'APPROVED',
      empresa: 'APPROVED',
      documentosExigidos: ['NATIONAL_ID', 'TAX_ID'],
      documentosValidos: ['NATIONAL_ID', 'TAX_ID'],
      aplicaFrota: true,
      veiculosTotal: 3,
      veiculosConformes: 3,
      acordosTotal: 5,
      acordosConcluidos: 5,
      avaliacoesTotal: 12,
      avaliacaoMedia: 5,
    }),
  );
  verificar('conta perfeita pontua 100', r.score === 100, `score=${r.score}`);
  verificar('nenhum fator fica de fora', r.indisponiveis.length === 0);
  verificar('todo o peso entra no cálculo', r.pesoComDados === r.pesoMaximo);
  verificar('os seis fatores estão presentes', r.fatores.length === 6);
}

// ---------------------------------------------------------------------------
console.log('\n[2] Dados parciais');
// Identidade e empresa verificadas, metade dos documentos, nada mais.
{
  const r = calcularTrustScore(
    base({
      identidade: 'APPROVED',
      empresa: 'APPROVED',
      documentosExigidos: ['NATIONAL_ID', 'TAX_ID'],
      documentosValidos: ['NATIONAL_ID'],
    }),
  );
  // Pesos com dados: 20 + 15 + 25 = 60. Pontos: 20 + 15 + 12.5 = 47.5.
  // 100 * 47.5 / 60 = 79.17 → 79.
  verificar('renormaliza pelos fatores com dados', r.score === 79, `score=${r.score}`);
  verificar('o peso com dados é 60', r.pesoComDados === 60, `peso=${r.pesoComDados}`);
  verificar(
    'frota, operações e avaliações ficam de fora',
    r.indisponiveis.map((i) => i.chave).sort().join(',') === 'avaliacoes,frota,operacoes',
  );
  verificar(
    'a explicação diz que é parcial',
    r.explicacao.includes('60 dos 100 pontos possíveis'),
    r.explicacao,
  );
  verificar(
    'o que falta é nomeado',
    (fator(r, 'documentacao').emFalta ?? []).join() === 'TAX_ID',
  );
}

// ---------------------------------------------------------------------------
console.log('\n[3] Zero avaliações');
// O caso que o produto tem hoje: 0 avaliações em toda a plataforma.
{
  const r = calcularTrustScore(
    base({
      identidade: 'APPROVED',
      empresa: 'APPROVED',
      avaliacoesTotal: 0,
      avaliacaoMedia: null,
    }),
  );
  const f = fator(r, 'avaliacoes');
  verificar('zero avaliações não é uma avaliação de zero', f.temDados === false);
  verificar('o peso das avaliações não entra', !r.fatores.filter((x) => x.temDados).includes(f));
  verificar('o valor fica a 0 mas sem pontos perdidos', f.pontos === 0 && f.peso === 10);
  verificar('a evidência explica a ausência', f.evidencia === 'Ainda não recebeu avaliações');

  // Sem avaliações e com o resto verificado, a conta ainda pontua 100 — não é
  // penalizada por ser nova.
  const s = calcularTrustScore(
    base({ identidade: 'APPROVED', empresa: 'APPROVED' }),
  );
  verificar('conta nova verificada não é penalizada', s.score === 100, `score=${s.score}`);
}

// ---------------------------------------------------------------------------
console.log('\n[4] Documentos expirados');
// Um documento expirado deixa de contar como válido — o chamador é que decide
// o que é válido, e é isso que se testa aqui.
{
  const r = calcularTrustScore(
    base({
      identidade: 'APPROVED',
      empresa: 'APPROVED',
      documentosExigidos: ['NATIONAL_ID', 'INSURANCE'],
      documentosValidos: ['NATIONAL_ID'], // o seguro expirou
    }),
  );
  verificar('documentação a 50%', fator(r, 'documentacao').valor === 0.5);
  verificar(
    'o documento expirado aparece em falta',
    (fator(r, 'documentacao').emFalta ?? []).join() === 'INSURANCE',
  );
  verificar('perde 12.5 dos 25 pontos', fator(r, 'documentacao').pontos === 12.5);
}

// ---------------------------------------------------------------------------
console.log('\n[5] Frota não conforme');
{
  const r = calcularTrustScore(
    base({
      identidade: 'APPROVED',
      empresa: 'APPROVED',
      aplicaFrota: true,
      veiculosTotal: 4,
      veiculosConformes: 1,
    }),
  );
  const f = fator(r, 'frota');
  verificar('frota entra no cálculo', f.temDados === true);
  verificar('1 em 4 dá 0.25', f.valor === 0.25);
  verificar('a evidência conta os veículos', f.evidencia === '1 de 4 veículos conformes');

  // Um perfil sem frota não é avaliado por frota nenhuma.
  const semFrota = calcularTrustScore(base({ aplicaFrota: false }));
  verificar('perfil sem frota não é avaliado por frota', fator(semFrota, 'frota').temDados === false);
  verificar(
    'e o motivo é dito',
    fator(semFrota, 'frota').evidencia === 'Não se aplica a este perfil',
  );

  // Perfil com frota mas sem veículos: também não há dados.
  const frotaVazia = calcularTrustScore(base({ aplicaFrota: true, veiculosTotal: 0 }));
  verificar(
    'frota vazia é ausência de dados, não zero',
    fator(frotaVazia, 'frota').temDados === false,
  );
}

// ---------------------------------------------------------------------------
console.log('\n[6] Ausência de dados');
// Identidade e empresa têm SEMPRE um estado, por isso nunca se chega a peso
// zero por esta via. O que se garante é que o mínimo é 0 e não um número
// negativo ou nulo por engano.
{
  const r = calcularTrustScore(base());
  verificar('conta sem nada verificado pontua 0', r.score === 0, `score=${r.score}`);
  verificar('só identidade e empresa têm dados', r.pesoComDados === 35);
  verificar('quatro fatores ficam de fora', r.indisponiveis.length === 4);
  verificar(
    'a explicação não inventa nada',
    r.explicacao.includes('Pontuação 0 em 100'),
    r.explicacao,
  );
}

// ---------------------------------------------------------------------------
console.log('\n[7] Determinismo e limites');
{
  const entrada = base({
    identidade: 'APPROVED',
    documentosExigidos: ['A', 'B', 'C'],
    documentosValidos: ['A'],
    acordosTotal: 3,
    acordosConcluidos: 2,
  });
  const a = JSON.stringify(calcularTrustScore(entrada));
  const b = JSON.stringify(calcularTrustScore(entrada));
  verificar('duas execuções dão exactamente o mesmo', a === b);

  const acima = calcularTrustScore(
    base({ identidade: 'APPROVED', avaliacoesTotal: 1, avaliacaoMedia: 7 }),
  );
  verificar('uma média acima de 5 não passa de 1', fator(acima, 'avaliacoes').valor === 1);

  const validoNaoExigido = calcularTrustScore(
    base({ documentosExigidos: ['A'], documentosValidos: ['A', 'Z'] }),
  );
  verificar(
    'um documento válido que não era exigido não infla o rácio',
    fator(validoNaoExigido, 'documentacao').valor === 1,
  );

  verificar('os pesos somam 100', Object.values(PESOS).reduce((s, p) => s + p, 0) === 100);
}

// ---------------------------------------------------------------------------
console.log('\n[8] Paridade entre o TypeScript e o SQL');
// Se alguém mudar um peso num lado e esquecer o outro, é aqui que se descobre.
{
  const sql = readFileSync(
    join(RAIZ, 'supabase/migrations/20260821_p1_trust_compliance.sql'),
    'utf8',
  );

  const CHAVES = {
    identidade: 'identidade',
    empresa: 'empresa',
    documentacao: 'documentacao',
    frota: 'frota',
    operacoes: 'operacoes',
    avaliacoes: 'avaliacoes',
  };

  for (const [chave, nomeSql] of Object.entries(CHAVES)) {
    const m = sql.match(new RegExp(`'chave','${nomeSql}'[^)]*?'peso',(\\d+)`));
    verificar(
      `o peso de ${chave} bate certo nos dois lados`,
      m !== null && Number(m[1]) === PESOS[chave],
      m ? `SQL=${m[1]}, TS=${PESOS[chave]}` : 'peso não encontrado no SQL',
    );
  }

  verificar(
    'o SQL também renormaliza pelo peso com dados',
    /ROUND\(100 \* v_pontos \/ v_peso_total\)/.test(sql),
  );
  verificar(
    'o SQL também devolve nulo quando não há dados',
    /IF v_peso_total = 0 THEN\s+v_score := NULL;/.test(sql),
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${passes} passaram, ${falhas} falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
