# FASE 8 — Fechar os gatilhos e a reconstrução funcional

**21 de Agosto de 2026** · CargoFlow · base de produção `wneehgoeqipgdpprphdc`

Nada foi aplicado à produção. Nada foi commitado. Nada foi enviado. Nenhuma
política foi alterada. Todo o trabalho de base de dados correu numa instância
PostgreSQL 16 vazia, destruída e reconstruída do zero várias vezes.

**O resultado que interessa:** uma base reconstruída só a partir do repositório
executa agora o percurso completo da plataforma — criar empresa, utilizador,
carga, viagem, correspondência, proposta, aceitação, acordo e rastreio. Antes
desta fase não conseguia inserir uma única carga.

---

## A · Os 14 gatilhos

Produção tem 27 gatilhos: 26 em `public`, 1 em `auth`. O repositório criava 13.
A comparação é por `md5(pg_get_triggerdef(oid))` dos dois lados.

| Gatilho | Tabela | Timing | Eventos | Função | Produção | Repositório (antes) | Origem |
|---|---|---|---|---|:--:|:--:|---|
| `trg_preparar_carga` | `loads` | BEFORE | INSERT, UPDATE | `preparar_carga` | ✓ | — | novo |
| `trg_load_confirmed_at` | `loads` | BEFORE | UPDATE | `cf_trigger_load_confirmed_at` | ✓ | — | novo |
| `trg_matches_carga` | `loads` | AFTER | INSERT, UPDATE **OF** 10 col. | `cf_trigger_matches_carga` | ✓ | — | novo |
| `trg_wallet_release` | `loads` | AFTER | UPDATE | `cf_trigger_wallet_release` | ✓ | — | novo |
| `trg_preparar_viagem` | `trips` | BEFORE | INSERT | `preparar_viagem` | ✓ | — | novo |
| `trg_matches_viagem` | `trips` | AFTER | INSERT, UPDATE **OF** 9 col. | `cf_trigger_matches_viagem` | ✓ | — | novo |
| `trg_apos_criar_proposta` | `offers` | AFTER | INSERT | `cf_apos_criar_proposta` | ✓ | — | novo |
| `trg_match_resultado_oferta` | `offers` | AFTER | INSERT | `cf_trigger_match_resultado_oferta` | ✓ | — | novo |
| `trg_match_resultado_acordo` | `agreements` | AFTER | INSERT | `cf_trigger_match_resultado_acordo` | ✓ | — | novo |
| `trg_notificar_mensagem` | `messages` | AFTER | INSERT | `cf_notificar_mensagem` | ✓ | — | novo |
| `trg_documents_updated` | `documents` | BEFORE | UPDATE | `set_updated_at` | ✓ | — | novo |
| `trg_drivers_updated` | `drivers` | BEFORE | UPDATE | `set_updated_at` | ✓ | — | novo |
| `trg_tenants_updated` | `tenants` | BEFORE | UPDATE | `set_updated_at` | ✓ | — | novo |
| `trg_vehicles_updated` | `vehicles` | BEFORE | UPDATE | `set_updated_at` | ✓ | — | novo |

**Mais um, que não estava na conta de 14:** `on_auth_user_created`, em
`auth.users`, `AFTER INSERT`, chamando `handle_new_auth_user()`. Único gatilho
fora de `public`, e também não estava versionado. Sem ele, quem se regista fica
com conta no `auth` e sem linha em `public.users`.

Os 13 que já existiam — `trg_loads_updated`, `trg_trips_updated`,
`trg_users_updated`, `trg_payments_updated_at`, `trg_user_blocklist_updated_at`,
`trg_reviews_recalculate`, `zz_trips_veiculo_elegivel` e os cinco
`zz_proteger_campos_admin` — já tinham definição byte a byte igual à produção
antes desta fase.

### Ordem de disparo

O PostgreSQL dispara por ordem alfabética do nome, dentro do mesmo tempo e
evento. Onde há mais do que um:

```
loads   BEFORE UPDATE:  trg_load_confirmed_at → trg_loads_updated → trg_preparar_carga
loads   AFTER  UPDATE:  trg_matches_carga → trg_wallet_release
offers  AFTER  INSERT:  trg_apos_criar_proposta → trg_match_resultado_oferta
users   BEFORE UPDATE:  trg_users_updated → zz_proteger_campos_admin
trips   BEFORE UPDATE:  trg_trips_updated → zz_trips_veiculo_elegivel
```

O prefixo `zz_` não é decoração: garante que a blindagem administrativa e a
elegibilidade de veículo correm **depois** de tudo o que possa alterar a linha.
`tests/paridade-triggers.mjs` verifica isso — se alguém renomear um gatilho para
algo que ordene depois de `zz_`, a protecção deixa de ser a última e **nada
rebenta**, que é o pior tipo de defeito.

**Resultado após a FASE 8: 27 de 27 idênticos por definição. Nenhum a faltar,
nenhum a mais.**

---

## B · Sequências e valores por omissão descobertos

| Objecto | O que é em produção | Estado |
|---|---|---|
| `seq_load_reference` | `bigint`, start 1, incr 1, cache 1, sem ciclo, **independente** (sem `OWNED BY`), grants `rwU` a `anon`/`authenticated`/`service_role` | versionada |
| `seq_trip_reference` | igual | versionada |
| `loads.confirmed_at` | `timestamptz`, nulável, sem default | versionada |
| `matches.oferta_criada_em` | `timestamptz`, nulável, sem default | versionada |
| `matches.acordo_fechado_em` | `timestamptz`, nulável, sem default | versionada |
| `trips.waypoints` | `jsonb` **NOT NULL** default `'[]'::jsonb` — era nulável na reconstrução | corrigida |

**O valor actual não foi copiado.** As sequências arrancam em 1, como manda o
mecanismo. Uma base reconstruída de raiz não tem cargas e não tem razão para
começar no número 22. Para quem restaure dados históricos, os valores da
produção a 21/08/2026 eram `seq_load_reference = 21` e `seq_trip_reference = 23`,
e o `setval` pertence ao procedimento de restauro, depois de carregadas as
linhas — não à migração.

---

## C · A cadeia de `loads.reference`

Medida no catálogo, não deduzida:

```
INSERT INTO loads (…)                     -- reference não é fornecida
  │
  ├─ trg_preparar_carga                   BEFORE INSERT OR UPDATE, FOR EACH ROW
  │    │
  │    └─ preparar_carga()                IF NEW.reference IS NULL OR '' THEN
  │         │
  │         └─ gerar_referencia('CF', 'seq_load_reference')
  │              │
  │              └─ EXECUTE format('SELECT nextval(%L)', seq_nome)
  │                   │
  │                   └─ seq_load_reference               → 21
  │
  └─ NEW.reference := 'CF' ||'-'|| ano ||'-'|| lpad(21, 6, '0')
                                                          → CF-2026-000021
```

Pontos que só se veem olhando:

- `loads.reference` é `text`, `NOT NULL`, **sem DEFAULT** e **sem identity**. A
  coluna não sabe nada da sequência.
- A ligação função→sequência é **por nome, dentro de um `EXECUTE`**. O
  PostgreSQL não a consegue registar como dependência — é por isso que a
  sequência é independente, e é por isso que nenhuma ferramenta a arrastou para
  o repositório.
- Faltavam as duas pontas: a sequência e o gatilho. Ter a função certa não
  chegava.

`trips.reference` é a mesma cadeia com `trg_preparar_viagem` → `preparar_viagem()`
→ `'VG'` → `seq_trip_reference`. Uma assimetria preservada: a carga dispara em
`INSERT OR UPDATE`, a viagem só em `INSERT`.

---

## D · Migrações criadas

| Ficheiro | O quê |
|---|---|
| `20260813_sequencias_referencia.sql` | as duas sequências, com grants e sem `setval` |
| `20260814_colunas_orfas_fluxo.sql` | `loads.confirmed_at`, `matches.oferta_criada_em`, `matches.acordo_fechado_em`, `trips.waypoints` NOT NULL |
| `20260823_versionar_triggers_core.sql` | os 14 gatilhos de `public` |
| `20260824_gatilho_auth_users.sql` | `on_auth_user_created`, em ficheiro próprio |
| `20260825_particoes_iniciais.sql` | arranque das partições de `tracking_points` |

**`CREATE OR REPLACE TRIGGER`**, não `DROP` + `CREATE`. O `DROP` removeria
momentaneamente uma protecção activa numa base em serviço; `OR REPLACE`
substitui em lugar, sem janela em que o gatilho não existe. Disponível desde o
PostgreSQL 14 — a produção corre 17.6.

**Porque `20260824` está separado:** é o único gatilho fora de `public`, e criar
um gatilho em `auth.users` exige privilégios sobre uma tabela de outro dono.
Separado, uma falha de privilégios não arrasta os outros catorze. E se falhar,
falha à vista — não há bloco a engolir a excepção.

**Porque `20260825` não chama `cf_garantir_particoes_futuras()`:** essa função
não é idempotente. Chama `criar_particao_tracking()`, que cria a tabela com
`IF NOT EXISTS` mas as políticas **sem** — correr duas vezes daria
`42710 duplicate_object`. A migração repete a mesma janela (mês corrente + 3) e
verifica a existência antes de chamar, deixando a função intacta com a sua
paridade MD5.

---

## E · Reconstruída vs produção

| Objecto | Produção | Reconstruída | Diferença | Explicação |
|---|---:|---:|---:|---|
| Gatilhos `public` | 26 | 26 | **0** | — |
| Gatilhos `auth` | 1 | 1 | **0** | — |
| Tabelas | 33 | 31 | −2 | `wallet_transactions`, `tracking_points_2026_12` |
| Colunas | 423 | 397 | −26 | `wallet_transactions` 10 + `tracking_points_2026_12` 9 + `vw_desvio_entregas` 7 |
| Índices | 108 | 102 | −6 | as duas tabelas ausentes |
| Enums | 12 | 11 | −1 | `wallet_status` |
| Vistas | 4 | 3 | −1 | `vw_desvio_entregas` |
| Sequências (`public`) | 4 | 4 | **0** | `audit_logs_id_seq`, `tracking_points_id_seq` e as duas de referência |
| Partições | 5 | 4 | −1 | a janela é «mês corrente + 3»; a produção tem uma a mais porque a tarefa mensal já correu |
| Políticas RLS | 103 | 66 | −37 | **intocadas nesta fase** — ver §I |

As 27 tabelas que existem dos dois lados têm **conjuntos de colunas idênticos**,
incluindo tipo e nulabilidade. Índices e restrições continuam idênticos à
definição em todas as tabelas comparáveis.

Uma nota de método: a primeira vez que contei sequências não filtrei por esquema
e apanhei `cron.job_jobid_seq`, do `bigserial` do meu próprio arreio de teste.
Dava um `+1` que eu ia atribuir à tabela de resultados do teste — que é
temporária e não é sequência nenhuma. Contado como deve ser, são 4 de cada lado.

---

## F · Reconstrução do zero

Base destruída e recriada, `04-MODELO-DE-DADOS.sql` seguido das 23 migrações por
ordem, contra PostgreSQL 16 vazio com PostGIS e os arreios do Supabase.

```
=== RECONSTRUÇÃO DO ZERO — base cf_final ===
  OK    00_bootstrap (arreios Supabase)
  OK    01_modelo_base
  OK    20260810_payments_phase2.sql
  …
  OK    20260823_versionar_triggers_core.sql
  OK    20260824_gatilho_auth_users.sql
  OK    20260825_particoes_iniciais.sql

>>> FALHAS: 0 <<<
```

**Um defeito meu, no caminho.** A primeira reconstrução desta fase deu 18 falhas
em cascata a partir de `schema "auth" does not exist`. Não era do repositório: os
papéis do PostgreSQL são do *cluster*, não da base, e o `CREATE ROLE anon` do meu
arreio abortava tudo na segunda execução. Corrigido com verificação de
existência.

---

## G · Fluxo funcional

Contra a base acabada de reconstruir, cada etapa isolada num bloco com captura de
excepção, para que uma falha não esconda as seguintes.

| | Etapa | Resultado |
|---|---|---|
| A | criar empresas | PASS |
| B | criar utilizadores, locais, veículo, motorista | PASS |
| C | criar carga → **CF-2026-000001** | PASS |
| D | publicar carga (`published_at` preenchido) | PASS |
| E | criar viagem → **VG-2026-000001** | PASS |
| F | publicar viagem | PASS |
| F2 | correspondências geradas (1) | PASS |
| G | criar proposta | PASS |
| H | aceitar proposta | PASS |
| I | acordo criado e proposta `ACCEPTED` | PASS |
| J | rastreio: `AGREEMENT_REACHED` automático + `PICKED_UP` manual | PASS |
| J2 | `trg_tenants_updated` actualiza `updated_at` | PASS |

**12 PASS, 0 FAIL.** As referências começam em `000001`, como devem numa base
nova.

### O que o fluxo descobriu que a leitura não descobriria

Duas etapas rebentaram com erros que nenhuma migração dá:

```
D · ERROR: record "new" has no field "confirmed_at"
G · ERROR: column "oferta_criada_em" does not exist
```

Funções versionadas, com paridade MD5 provada, a escrever em colunas que nunca
entraram em ficheiro nenhum. Uma função certa a escrever numa coluna que não
existe é uma função que rebenta.

### Duas asserções minhas que estavam erradas

Ambas do tipo que dá **falso PASS** se escrita ao contrário, e por isso vale a
pena registá-las:

1. **J** contava todos os eventos de rastreio e esperava 1. Havia 2 —
   `cf_aceitar_proposta` já regista um `AGREEMENT_REACHED`. Se eu tivesse
   escrito `>= 1`, teria passado sem provar nada. Passou a verificar cada evento
   pelo tipo.
2. **J2** comparava `updated_at > created_at`. Dentro de uma transação `now()` é
   fixo, portanto os dois são iguais e a asserção não podia passar nunca — nem
   provaria nada se passasse. Passou a inserir com um `updated_at` de 2020 e a
   verificar que o `UPDATE` o puxa para o presente.

---

## H · Regressão

| Verificação | Resultado |
|---|---|
| `test:seguranca` | 128 / 128 |
| `test:trust` | 39 / 39 |
| `test:elegibilidade` | 41 / 41 |
| `test:paridade-sql` | 243 / 243 |
| `test:sql-security` | 152 / 152 |
| `test:schema` | 41 / 41 · 2 não testáveis |
| **`test:triggers`** (novo) | 36 / 36 |
| **`test:reconstruction`** (novo) | 12 / 12 etapas |
| `tsc --noEmit` | sem erros |
| `next build` | passa |
| `eslint .` | **5 erros — pré-existentes** |

Os 5 erros de lint estão em `components/entrega/galeria-fotos.tsx` (3) e
`components/shell/nav-mobile.tsx` (2), intactos desde `600a160`. Não são desta
fase e não os corrigi.

`test:reconstruction` escreve **NÃO TESTÁVEL** e sai com 0 quando não encontra
base de dados. Nunca escreve PASS: um teste que não correu não é um teste que
passou.

**O teste de gatilhos foi testado.** Três mutações deliberadas —
mudar `BEFORE` para `AFTER`, tirar uma coluna do `UPDATE OF`, acrescentar um
gatilho fora do manifesto — e as três foram apanhadas. O ficheiro ficou byte a
byte igual depois.

---

## I · Políticas divergentes — inventário, sem alteração

**Nenhuma política foi criada, alterada ou removida nesta fase.** A produção
continua com as suas 103.

Mas correr o fluxo como `authenticated` e como `anon` produziu uma medição que a
auditoria vai precisar, e que muda o enquadramento da decisão.

### O que a política do repositório diz

```sql
CREATE POLICY loads_marketplace_read ON public.loads FOR SELECT
USING (
  status = 'PUBLISHED'
  OR tenant_id = public.current_tenant_id()
  OR public.is_platform_admin()
);
```

### O que a política da produção diz

```sql
loads_read: ((status = 'PUBLISHED' AND auth.uid() IS NOT NULL)
             OR tenant_id = current_tenant_id()
             OR (assigned_trip_id IS NOT NULL AND cf_transporto_esta_carga(assigned_trip_id))
             OR cf_tenho_proposta_na_carga(id)
             OR is_platform_admin())
```

### A medição

Base reconstruída, com as políticas do repositório, uma carga `PUBLISHED` e por
atribuir:

| Cenário | Resultado |
|---|---|
| Transportador autenticado, de outra empresa, vê cargas `PUBLISHED` | 1 — mercado aberto |
| **Anónimo, sem sessão nenhuma, vê cargas `PUBLISHED`** | **1** |
| **Anónimo vê viagens** | **1** |
| Transportador altera carga alheia | bloqueado, 0 linhas |

A política do repositório **não exige autenticação**. A da produção exige.

**A versão do repositório é a menos segura das duas.** Aplicar o repositório a
uma base nova exporia o mercado publicamente. Isto reforça a instrução de não
mexer: a resolução da divergência não pode ser «aplicar o que está no
repositório».

Não corrigi nada. As perguntas que a auditoria tem de responder continuam as que
o senhor listou, e agora com um facto medido a servir de ponto de partida.

**Nota sobre os `GRANT`.** Ao medir isto descobri que a base reconstruída não
concedia nada a `authenticated` — as políticas existiam e o portão anterior, o
`GRANT` ao nível da tabela, não. Em produção, `anon`, `authenticated` e
`service_role` têm **todos os privilégios** em todas as tabelas de `public`,
incluindo `DELETE` e `TRUNCATE`; a RLS é a única coisa entre `anon` e os dados.
Isso vem dos `ALTER DEFAULT PRIVILEGES` do próprio Supabase, ou seja, é camada de
instância e não do repositório — reproduzi-o no arreio de teste, não numa
migração. Vale a pena a auditoria olhar para o facto de `anon` ter `TRUNCATE`:
`TRUNCATE` **não passa por RLS**. Na prática o PostgREST não o expõe, mas é uma
aresta afiada.

---

## J · Riscos que ficam

| Risco | Consequência |
|---|---|
| **Divergência `loads`/`trips`** | por decidir; a versão do repositório abre o mercado a não autenticados |
| `criar_particao_tracking()` não é idempotente | se a tarefa mensal correr duas vezes no mesmo mês, falha com `42710` |
| `wallet_transactions`, `wallet_status`, `vw_desvio_entregas` | continuam por versionar |
| 39 políticas RLS + 11 de storage | por versionar |
| 4 baldes de storage, 2 tarefas de cron | por versionar |
| Localidades de Angola (semente) | por versionar — sem elas não se publica uma carga em produção |
| `anon` tem `USAGE` nas sequências | pode queimar números e abrir buracos na numeração |
| `shipment_photos` sem barreira RESTRICTIVE do P0 | documentado desde fase anterior |
| 5 erros de lint pré-existentes | por corrigir |

**Uma limitação desta fase que quero dizer com clareza:** a base isolada corre
**PostgreSQL 16.15**; a produção corre **17.6**. Tudo o que aqui está foi provado
em 16. Não encontrei nada que dependa da diferença — `CREATE OR REPLACE TRIGGER`
existe desde a 14, e as definições extraídas são idênticas — mas a prova é em 16,
não em 17, e não vou apresentá-la como se fosse outra coisa.

---

## K · Confirmação

| | |
|---|---|
| `HEAD` | `600a160` |
| `origin/main` | `600a160` |
| Ramo | `main` |
| Árvore de trabalho | **suja** — 5 ficheiros alterados, 23 novos, nenhum commitado |
| Produção alterada | **NÃO** |
| Commit | **NÃO** |
| Push | **NÃO** |
| Deployment | **NÃO** |
| Políticas alteradas | **NÃO** |
| Dados reais alterados | **NÃO** |
| Cron alterado | **NÃO** |

Verificado depois do trabalho todo: produção tem 103 políticas, 26 gatilhos em
`public`, 423 colunas, última migration `20260821105627` e `seq_load_reference`
em 21 — exactamente como estava no início desta fase.
