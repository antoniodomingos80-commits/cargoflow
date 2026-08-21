/**
 * Vigia estrutural da segurança da base de dados.
 *
 * O QUE ISTO É
 *
 * Um teste que olha para uma base construída a partir do repositório e verifica
 * invariantes que não dependem de listas de excepções escritas à mão. Cada
 * regra é uma propriedade estrutural: ou o catálogo a satisfaz, ou não.
 *
 * PORQUE NÃO TEM LISTA DE EXCEPÇÕES
 *
 * As fases anteriores mostraram o problema das listas: `tests/schema.mjs` teve
 * de crescer uma lista de dívida conhecida porque não havia forma estrutural de
 * distinguir «falta» de «não se aplica». Aqui há. Uma tabela ou tem RLS ou não
 * tem. Uma função `SECURITY DEFINER` ou qualifica as relações que usa, ou tem
 * `pg_temp` no `search_path`, ou está exposta. Não é preciso votar.
 *
 * ESTE TESTE ESTÁ VERMELHO DE PROPÓSITO
 *
 * A 21/08/2026 o repositório falha as regras 1, 2 e 3. Não é defeito do teste —
 * é o que a FASE 9 mediu e a FASE 10 especificou para correcção. O teste fica
 * fora da cadeia `npm test` até esse lote entrar, para não esconder o resto.
 * Quando entrar, passa a fazer parte da cadeia e nunca mais deixa regredir.
 *
 * SE NÃO CONSEGUIR LIGAR-SE, FALHA
 *
 * Ao contrário de `test:reconstruction` e `test:rls`, que saem com 0 quando não
 * há base de dados, este sai com 1. Um vigia que não conseguiu olhar não pode
 * dizer que está tudo bem. (Os outros dois foram escritos antes desta regra;
 * alinhá-los é uma decisão em aberto — ver SECURITY-MODEL-TARGET.md §10.)
 *
 * Correr: npm run test:seguranca-estrutural
 *   ou:   CF_TEST_DSN=postgres://… npm run test:seguranca-estrutural
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();

let falhas = 0;
let passes = 0;
const achados = [];

function verificar(regra, linhasMas, detalhe = '') {
  if (linhasMas.length === 0) {
    passes++;
    console.log(`  PASS  ${regra}`);
  } else {
    falhas++;
    console.log(`  FALHA ${regra} — ${linhasMas.length} ocorrência(s)${detalhe ? ` · ${detalhe}` : ''}`);
    for (const l of linhasMas.slice(0, 12)) console.log(`          ${l}`);
    if (linhasMas.length > 12) console.log(`          … e mais ${linhasMas.length - 12}`);
    achados.push({ regra, ocorrencias: linhasMas });
  }
}

function naoVerificado(porque) {
  console.log('\n  NÃO VERIFICADO — e por isso este teste FALHA');
  console.log(`  ${porque}`);
  console.log('  Monte a base isolada: ver SCHEMA-BASE-RECONSTRUCTION-PLAN.md §6\n');
  process.exit(1);
}

// --- ligação ---------------------------------------------------------------
let psql = null;
for (const c of ['psql', '/usr/lib/postgresql/16/bin/psql', '/usr/lib/postgresql/17/bin/psql']) {
  try { execFileSync(c, ['--version'], { stdio: 'ignore' }); psql = c; break; } catch { /* segue */ }
}
if (!psql) naoVerificado('não há psql disponível');

const dsn = process.env.CF_TEST_DSN;
function consulta(sql) {
  const args = dsn
    ? [dsn, '-tAF|', '-c', sql]
    : ['-h', '/tmp/pgrun', '-p', '55432',
       '-U', process.env.CF_TEST_USER || 'postgres',
       '-d', process.env.CF_TEST_DB || 'cf_repo',
       '-tAF|', '-c', sql];
  return execFileSync(psql, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    .split('\n').map((l) => l.trim()).filter(Boolean);
}

try {
  const vivo = consulta("select 'ok'");
  if (vivo[0] !== 'ok') naoVerificado('a base respondeu de forma inesperada');
} catch (e) {
  naoVerificado(`não foi possível ligar: ${(e.stderr || e.message || '').split('\n')[0]}`);
}

// Uma base vazia daria PASS em tudo. Isso é o falso positivo que este ficheiro
// existe para evitar.
const nTabelas = Number(consulta(
  "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace " +
  "where n.nspname='public' and c.relkind='r'")[0]);
if (nTabelas < 20) naoVerificado(`a base só tem ${nTabelas} tabelas — não é uma reconstrução completa`);
console.log(`\nBase com ${nTabelas} tabelas em public.\n`);

// --- 1 · toda a tabela de negócio tem RLS ----------------------------------
console.log('[1] Row Level Security activada');
verificar('todas as tabelas de public têm RLS',
  consulta(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
              and c.relname <> 'spatial_ref_sys' order by 1`),
  'sem RLS, as políticas são decorativas e mandam os GRANT');

// --- 2 · RLS activa sem política permissiva = nega tudo --------------------
console.log('\n[2] Nenhuma tabela nega tudo por engano');
verificar('toda a tabela com RLS tem pelo menos uma política PERMISSIVE',
  consulta(`select c.relname||' ('||(select count(*) from pg_policies q
              where q.schemaname='public' and q.tablename=c.relname)||' políticas, todas RESTRICTIVE)'
            from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind='r' and c.relrowsecurity
              and not exists (select 1 from pg_policies q where q.schemaname='public'
                              and q.tablename=c.relname and q.permissive='PERMISSIVE')
            order by 1`),
  'RESTRICTIVE faz AND; sem uma PERMISSIVE ninguém lê nada');

// --- 3 · barreira RESTRICTIVE numa tabela sem RLS é inerte -----------------
console.log('\n[3] Nenhuma barreira inerte');
verificar('nenhuma política RESTRICTIVE vive numa tabela com RLS desligada',
  consulta(`select distinct q.tablename||'.'||q.policyname
            from pg_policies q join pg_class c on c.relname=q.tablename
            join pg_namespace n on n.oid=c.relnamespace and n.nspname='public'
            where q.schemaname='public' and q.permissive='RESTRICTIVE' and not c.relrowsecurity
            order by 1`),
  'parece protegido e não está — é pior do que não existir');

// --- 4 · SECURITY DEFINER e pg_temp, sem lista de excepções ----------------
console.log('\n[4] SECURITY DEFINER a salvo de sombra em pg_temp');
//
// A regra é estrutural: uma função DEFINER está a salvo se o `search_path`
// nomear `public` E `pg_temp` — os dois, porque `pg_temp` sozinho não resolve
// nada e `public` sozinho é o buraco — OU se nenhuma das relações que refere
// estiver por qualificar.
// Procuram-se referências não qualificadas a tabelas reais de public — o
// `\y` do PostgreSQL, não o `\b`, que aqui significa backspace.
verificar('nenhuma função DEFINER refere relações não qualificadas sem public+pg_temp',
  consulta(`with defs as (
              select p.oid, p.proname, p.prosrc,
                     coalesce(array_to_string(p.proconfig,','),'') cfg
              from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.prosecdef
                and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
            ), tabelas as (
              select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relkind in ('r','v','p')
            )
            select distinct d.proname||' → '||t.relname
            from defs d cross join tabelas t
            where not (d.cfg ~ 'pg_temp' and d.cfg ~ 'public')
              and d.prosrc ~* ('(from|join|into|update)\\s+'||t.relname||'\\y')
              and d.prosrc !~* ('(from|join|into|update)\\s+public\\.'||t.relname||'\\y')
            order by 1`),
  'ou qualifica public.<tabela> ou põe pg_temp no search_path');

console.log('\n[4b] SECURITY DEFINER com search_path definido');
verificar('nenhuma função DEFINER sem search_path e com referências não qualificadas',
  consulta(`with defs as (
              select p.proname, p.prosrc from pg_proc p
              join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.prosecdef and p.proconfig is null
                and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
            ), tabelas as (
              select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='public' and c.relkind in ('r','v','p')
            )
            select distinct d.proname||' → '||t.relname
            from defs d cross join tabelas t
            where d.prosrc ~* ('(from|join|into|update)\\s+'||t.relname||'\\y')
              and d.prosrc !~* ('(from|join|into|update)\\s+public\\.'||t.relname||'\\y')
            order by 1`));

// --- 5 · GRANTs uniformes --------------------------------------------------
console.log('\n[5] GRANTs sem surpresas');
//
// Não se decide aqui se `TRUNCATE` para `anon` é aceitável — decide-se que
// nenhuma tabela foge ao padrão. Assim uma concessão nova, a mais ou a menos,
// aparece sem ser preciso manter uma lista tabela a tabela.
const padraoGrants = consulta(
  `select pr||' :: '||count(*)::text from (
     select g.table_name, g.grantee, string_agg(g.privilege_type,',' order by g.privilege_type) pr
     from information_schema.role_table_grants g
     where g.table_schema='public' and g.grantee in ('anon','authenticated','service_role')
     group by 1,2) s group by pr order by count(*) desc`);
const maioritario = padraoGrants[0] ? padraoGrants[0].split(' :: ')[0] : null;
verificar('todas as tabelas partilham o mesmo conjunto de privilégios',
  padraoGrants.slice(1),
  maioritario ? `padrão dominante: ${maioritario}` : 'nenhum padrão encontrado');
if (!maioritario) { falhas++; console.log('  FALHA não se leu nenhum GRANT — a base não tem privilégios atribuídos'); }

verificar('nenhum papel além de anon/authenticated/service_role tem privilégios',
  consulta(`select distinct grantee from information_schema.role_table_grants
            where table_schema='public'
              and grantee not in ('anon','authenticated','service_role','postgres','PUBLIC')
              and grantee <> current_user order by 1`));

// --- 6 · cobertura da barreira de contas bloqueadas ------------------------
console.log('\n[6] Toda a tabela que aceita escrita tem barreira de conta bloqueada');
//
// PORQUE NÃO SE VERIFICA AQUI «objecto novo não versionado»
//
// A tentação era comparar as políticas vivas com os `CREATE POLICY` das
// migrações. Não serve: esta base É a saída do repositório, portanto toda a
// política dela veio de lá por construção, e a regra passaria sempre. Um PASS
// que não pode falhar não é um teste. Pior: a primeira versão desta regra dava
// 36 falsos alarmes, porque as `*_bloqueio_*` são criadas com `format()` e o
// nome literal não existe em ficheiro nenhum.
//
// «Objecto vivo em produção que o repositório não sabe criar» responde-se
// comparando as duas bases, o que exige leitura da produção e está feito em
// FASE7-RELATORIO.md §D e FASE9-AUDITORIA-RLS.md §1. Aqui fica o que se
// verifica mesmo: se uma tabela aceita INSERT/UPDATE/DELETE de `authenticated`,
// então uma conta bloqueada tem de esbarrar numa RESTRICTIVE com
// `pode_operar()`.
//
// As excepções são estruturais, não uma lista: tabelas onde `authenticated` não
// tem privilégio de escrita, e as partições, que herdam a barreira do pai.
verificar('toda a tabela com escrita concedida tem barreira pode_operar()',
  consulta(`with escrevivel as (
              select distinct g.table_name
              from information_schema.role_table_grants g
              where g.table_schema='public' and g.grantee='authenticated'
                and g.privilege_type in ('INSERT','UPDATE','DELETE')
            ), com_barreira as (
              select distinct q.tablename
              from pg_policies q
              where q.schemaname='public' and q.permissive='RESTRICTIVE'
                and coalesce(q.qual,'')||coalesce(q.with_check,'') like '%pode_operar%'
            )
            select e.table_name from escrevivel e
            left join com_barreira b on b.tablename = e.table_name
            join pg_class c on c.relname = e.table_name
            join pg_namespace n on n.oid = c.relnamespace and n.nspname='public'
            where b.tablename is null
              and c.relkind = 'r'
              and c.relispartition = false
              and e.table_name <> 'spatial_ref_sys'
            order by 1`),
  'sem barreira, uma conta suspensa continua a escrever pela API');

// --- resultado -------------------------------------------------------------
console.log(`\n${passes} regras passaram, ${falhas} falharam\n`);
if (falhas > 0) {
  console.log('Achados por regra:');
  for (const a of achados) console.log(`  · ${a.regra}: ${a.ocorrencias.length}`);
  console.log('\nVer SECURITY-MODEL-TARGET.md para o modelo-alvo e o plano.\n');
}
process.exit(falhas === 0 ? 0 : 1);
