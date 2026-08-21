/**
 * Testes da elegibilidade do veículo.
 *
 * `lib/frota/elegibilidade.ts` é uma função pura — exercida aqui caso a caso.
 *
 * A última secção compara a regra em TypeScript com a regra em SQL
 * (`cf_veiculo_elegivel`). Existem duas porque a interface precisa de explicar
 * o motivo e a base de dados precisa de recusar a escrita mesmo que alguém
 * ignore a aplicação. Duas cópias da mesma regra divergem sempre, a menos que
 * algo verifique — este teste é esse algo.
 *
 * Correr: node --experimental-strip-types tests/elegibilidade-veiculo.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const { avaliarElegibilidade } = await import(join(RAIZ, 'lib/frota/elegibilidade.ts'));

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
console.log('\n[1] Estados de conformidade');

{
  const r = avaliarElegibilidade('APPROVED', 'compliant', []);
  verificar('compliant é elegível', r.elegivel === true);
  verificar('compliant não tem motivo nem aviso', r.motivo === null && r.gravidade === 'ok');
}

{
  const r = avaliarElegibilidade('PENDING', 'pending', ['INSURANCE', 'INSPECTION']);
  verificar('pending É elegível — não bloqueia', r.elegivel === true);
  verificar('pending é assinalado como aviso', r.gravidade === 'aviso');
  verificar(
    'pending diz exactamente o que falta',
    r.motivo === 'Documentação por concluir: Seguro, Inspeção',
    r.motivo,
  );
}

{
  const r = avaliarElegibilidade('APPROVED', 'pending', []);
  verificar(
    'pending sem lista de faltas ainda assim explica',
    r.elegivel === true && r.motivo === 'Documentação em análise',
    r.motivo,
  );
}

{
  const r = avaliarElegibilidade('APPROVED', 'non_compliant', []);
  verificar('non_compliant NÃO é elegível', r.elegivel === false);
  verificar('non_compliant é bloqueio', r.gravidade === 'bloqueio');
  verificar('non_compliant explica porquê', r.motivo === 'Documentação do veículo recusada');
}

{
  const r = avaliarElegibilidade('APPROVED', 'expired', []);
  verificar('expired NÃO é elegível', r.elegivel === false);
  verificar(
    'expired nomeia seguro e inspeção',
    r.motivo === 'Seguro ou inspeção fora de validade',
    r.motivo,
  );
}

// ---------------------------------------------------------------------------
console.log('\n[2] Seguro e inspeção fora de prazo');
// A data em si é avaliada pela vista `vehicle_compliance`, que devolve
// `expired`. O que se garante aqui é que `expired` nunca passa.
{
  const seguro = avaliarElegibilidade('APPROVED', 'expired', ['INSURANCE']);
  verificar('seguro expirado bloqueia', seguro.elegivel === false);

  const inspecao = avaliarElegibilidade('APPROVED', 'expired', ['INSPECTION']);
  verificar('inspeção expirada bloqueia', inspecao.elegivel === false);

  verificar(
    'um veículo APROVADO com seguro vencido não é elegível',
    avaliarElegibilidade('APPROVED', 'expired', []).elegivel === false,
  );
}

// ---------------------------------------------------------------------------
console.log('\n[3] Verificação do veículo');
{
  verificar(
    'verificação recusada bloqueia, mesmo com documentos em ordem',
    avaliarElegibilidade('REJECTED', 'compliant', []).elegivel === false,
  );
  verificar(
    'e o motivo é o da verificação, não o da conformidade',
    avaliarElegibilidade('REJECTED', 'compliant', []).motivo ===
      'Verificação do veículo recusada',
  );
  verificar(
    'verificação expirada bloqueia',
    avaliarElegibilidade('EXPIRED', 'compliant', []).elegivel === false,
  );
  verificar(
    'a verificação tem precedência sobre a conformidade',
    avaliarElegibilidade('REJECTED', 'expired', []).motivo ===
      'Verificação do veículo recusada',
  );
  verificar(
    'UNDER_REVIEW não bloqueia por si só',
    avaliarElegibilidade('UNDER_REVIEW', 'compliant', []).elegivel === true,
  );
}

// ---------------------------------------------------------------------------
console.log('\n[4] Determinismo');
{
  const a = JSON.stringify(avaliarElegibilidade('PENDING', 'pending', ['INSURANCE']));
  const b = JSON.stringify(avaliarElegibilidade('PENDING', 'pending', ['INSURANCE']));
  verificar('duas execuções dão exactamente o mesmo', a === b);

  const motor = readFileSync(join(RAIZ, 'lib/frota/elegibilidade.ts'), 'utf8');
  const codigo = motor.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  verificar('não lê a base de dados', !/supabase|createClient|rpc\(/.test(codigo));
  verificar('não lê o relógio', !/Date\.now|new Date\(/.test(codigo));
}

// ---------------------------------------------------------------------------
console.log('\n[5] Paridade com a regra em SQL');
{
  const sql = readFileSync(
    join(RAIZ, 'supabase/migrations/20260821_p1_elegibilidade_veiculo.sql'),
    'utf8',
  );

  verificar('existe a função de elegibilidade', /FUNCTION public\.cf_veiculo_elegivel/.test(sql));
  verificar(
    'o SQL bloqueia os mesmos dois estados de conformidade',
    /NOT IN \('non_compliant', 'expired'\)/.test(sql),
  );
  verificar(
    'o SQL bloqueia as mesmas duas verificações',
    /verification NOT IN \('REJECTED', 'EXPIRED'\)/.test(sql),
  );
  verificar(
    'o SQL trata a ausência de linha como pending, tal como o TypeScript',
    /COALESCE\(vc\.estado_compliance, 'pending'\)/.test(sql),
  );
  verificar('o SQL exige veículo activo', /v\.is_active/.test(sql));
  verificar(
    'o SQL exige que o veículo seja da própria empresa',
    /v\.tenant_id = public\.current_tenant_id\(\)/.test(sql),
  );
  verificar(
    'publicar viagem passa por uma política RESTRICTIVE',
    /CREATE POLICY trips_veiculo_elegivel[\s\S]*?AS RESTRICTIVE[\s\S]*?FOR INSERT[\s\S]*?cf_veiculo_elegivel\(vehicle_id\)/.test(
      sql,
    ),
  );
  verificar(
    'trocar de veículo numa viagem existente também é verificado',
    /NEW\.vehicle_id IS DISTINCT FROM OLD\.vehicle_id/.test(sql),
  );
  verificar(
    'a verificação na edição só corre quando o veículo muda',
    /CREATE TRIGGER zz_trips_veiculo_elegivel\s+BEFORE UPDATE ON public\.trips/.test(sql),
  );
  verificar(
    'a sentinela de data deixou de escapar da vista',
    /NULLIF\(\s*LEAST\(/.test(sql) && /DATE '9999-12-31'\s*\)\s*AS valido_ate/.test(sql),
  );

  // A regra é a mesma dos dois lados: nenhum estado bloqueado no SQL é
  // permitido no TypeScript, e vice-versa.
  const bloqueadosNoTs = ['non_compliant', 'expired'].filter(
    (e) => avaliarElegibilidade('APPROVED', e, []).elegivel === false,
  );
  verificar(
    'os estados bloqueados coincidem nos dois lados',
    bloqueadosNoTs.join(',') === 'non_compliant,expired',
  );
  const permitidosNoTs = ['compliant', 'pending'].filter(
    (e) => avaliarElegibilidade('APPROVED', e, []).elegivel === true,
  );
  verificar(
    'os estados permitidos coincidem nos dois lados',
    permitidosNoTs.join(',') === 'compliant,pending',
  );
}

// ---------------------------------------------------------------------------
console.log('\n[6] A aplicação não é a única barreira');
{
  const viagens = readFileSync(join(RAIZ, 'lib/viagens/actions.ts'), 'utf8');
  verificar(
    'criarViagem verifica a elegibilidade no servidor',
    /garantirVeiculoElegivel\(supabase, d\.vehicleId\)/.test(viagens),
  );
  verificar(
    'editarViagem só reavalia quando o veículo muda',
    /if \(d\.vehicleId !== atual\.vehicle_id\) \{\s*const barreira = await garantirVeiculoElegivel/.test(
      viagens,
    ),
  );
  verificar(
    'a barreira usa a mesma função pura',
    /avaliarElegibilidade\(/.test(viagens),
  );

  const frota = readFileSync(join(RAIZ, 'lib/frota/actions.ts'), 'utf8');
  verificar(
    'a lista deixou de filtrar só por is_active',
    /vehicle_compliance/.test(frota),
  );
  verificar(
    'a lista é filtrada pela empresa da sessão',
    /\.eq\('tenant_id', perfil\.tenant\.id\)/.test(frota),
  );

  const formulario = readFileSync(
    join(RAIZ, 'app/(app)/viagens/nova/formulario.tsx'),
    'utf8',
  );
  verificar(
    'o veículo não elegível aparece desactivado em vez de desaparecer',
    /disabled=\{!v\.elegivel\}/.test(formulario),
  );
  verificar(
    'a interface diz "não elegível" e o motivo',
    /Veículo não elegível/.test(formulario) && /\{veiculo\.motivo\}/.test(formulario),
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${passes} passaram, ${falhas} falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
