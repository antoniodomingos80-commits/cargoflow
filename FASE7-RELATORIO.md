# FASE 7 — Fecho da reconstrução e hardening

**21 de Agosto de 2026** · CargoFlow · base `wneehgoeqipgdpprphdc`

Nada foi aplicado à produção. Nada foi commitado. Nada foi enviado. Todo o
trabalho de base de dados correu numa instância PostgreSQL 16 vazia e isolada,
ou dentro de transações revertidas.

---

## A · O que esta fase respondia

Duas perguntas, e nenhuma delas se responde a ler código:

1. Se a base de dados se perdesse, o repositório reconstruía-a?
2. A dívida de `pg_temp` está mesmo fechada, ou só o teste é que passa?

---

## B · Migrações reparadas

| Ficheiro | O que tinha | O que se fez |
|---|---|---|
| `20260816_trust_layer_minimal.sql` | BOM invisível; `AS \$\ … \$\` em vez de `$$`; `CONSTRAINT … UNIQUE (…) WHERE …`, que o PostgreSQL não aceita | BOM removido; blocos `$function$` repostos como em produção, com os CRLF; restrição parcial trocada por `CREATE UNIQUE INDEX … WHERE (is_active = true)`, que é o que a produção tem |
| `20260815_users_colunas_manuais.sql` | *(não existia)* | criado — 12 colunas de `users` que tinham entrado em produção à mão, com tipo, omissão e nulabilidade exactos |
| `20260812_funcoes_auxiliares.sql` | *(não existia)* | criado — as 10 auxiliares saíram do ficheiro de rastreio, porque `p1_trust_compliance` precisa de `current_app_user_id()` e, dentro do mesmo dia, «p1» ordena antes de «versionar» |

O terceiro é o tipo de defeito que só aparece a correr: o prefixo de data não
ordena nada dentro do mesmo dia.

---

## C · A reconstrução, executada

`04-MODELO-DE-DADOS.sql` seguido das 18 migrações, por ordem, contra PostgreSQL
16 + PostGIS vazio, com `auth`, `storage`, `cron` e os três papéis do Supabase
simulados.

```
=== RECONSTRUÇÃO FINAL ===
  OK    00_modelo_base
  OK    20260810_payments_phase2.sql
  …
  OK    20260822_hardening_pg_temp.sql

>>> FALHAS: 0 <<<
```

**E mesmo assim a base não serve.** Primeira coisa que tentei fazer com ela:

```sql
INSERT INTO public.loads (…) VALUES (…);
ERROR:  null value in column "reference" of relation "loads"
```

`preparar_carga()` existe e tem paridade MD5 com a produção. O gatilho que a
dispara não existe. A sequência que ela usa não existe.

**«Nenhuma migração falhou» não é «a base funciona».** Foi o achado mais útil
desta fase e não teria aparecido sem executar.

| | 1.ª medição | Agora | Produção |
|---|---:|---:|---:|
| Tabelas | 24 | 31 | 33 |
| Funções `cf_*` | 42 | **51** | 51 |
| Políticas RLS | 17 | 66 | 103 |
| Gatilhos | 15 | 17 | 34 |
| Índices | 75 | 102 | 108 |
| Migrações que falham | 4 | **0** | — |

---

## D · Políticas RLS — inventário

Inventário completo em `RLS-INVENTARIO.md` §1: nome, tabela, comando,
permissiva/restritiva, papéis, `USING`, `WITH CHECK`, tabela a tabela.
**Não corrigi nenhuma**, conforme instruído.

O saldo de `−37` não são 37 omissões:

- **41** políticas existem em produção e o repositório não as cria
  (2 delas são geradas por partição, ficam **39** reais);
- **4** existem no repositório e **não** em produção.

Essas quatro são o achado sério: `loads_marketplace_read`, `loads_owner_write`,
`trips_marketplace_read`, `trips_owner_write` estão em
`20260811_enable_rls_core.sql` e no modelo base. Em produção, o lugar delas é
ocupado por `loads_read`/`insert`/`update`/`delete` e equivalentes de `trips` —
**que não existem em ficheiro nenhum**.

Alguém substituiu à mão as regras de visibilidade do mercado, directamente na
produção. Aplicar o repositório a uma base nova não repõe a plataforma que está
em serviço: repõe outra, com regras diferentes. Qual das duas é a certa é uma
decisão de produto, e por isso está registada e não resolvida.

Três políticas de produção merecem revisão quando forem versionadas —
`load_attachments_follow_load` (é `ALL` e a condição é só «a carga existe», sem
menção a empresa), `locations_insert` (qualquer autenticado insere) e
`reviews_read` (todas as avaliações legíveis por qualquer autenticado). Não são
falhas provadas; são portas mais largas que o resto do sistema.

Em `storage.objects`: produção tem 11 políticas por balde, escritas à mão; o
repositório cria 4 com outro desenho, e nenhuma delas existe em produção.

---

## E · Gatilhos

14 gatilhos distintos (17 linhas de catálogo) não são criados por ficheiro
nenhum. As funções existem todas — falta o `CREATE TRIGGER` que as liga.

Entre eles: `trg_preparar_carga`, `trg_preparar_viagem`, `trg_matches_carga`,
`trg_matches_viagem`, `trg_apos_criar_proposta`, `trg_notificar_mensagem`,
`trg_wallet_release`, e os quatro `set_updated_at` de `documents`, `drivers`,
`tenants` e `vehicles`. Lista completa em `RLS-INVENTARIO.md` §2.

**É esta a razão directa pela qual a base reconstruída não publica uma carga.**

---

## F · Índices e restrições

Comparados **por definição**, não por nome: para cada tabela, o MD5 da
concatenação das definições ordenadas.

**62 de 62 conjuntos comparáveis são idênticos. Zero divergências.**

As diferenças de contagem explicam-se inteiramente por duas tabelas ausentes:

| Tabela ausente | Índices | Restrições |
|---|---:|---:|
| `wallet_transactions` | 4 | 5 |
| `tracking_points_2026_12` | 2 | 3 |
| | **6** = `−6` | **8** = `−8` |

A primeira medição desta comparação deu «tudo diferente». Era um `join` mal
escrito meu, não um desvio do esquema. Corrigido e reconfirmado linha a linha.

---

## G · Storage e tarefas agendadas

**Baldes: 4 em produção, 0 na reconstrução.** Nenhuma migração os cria.
`avatares` (público, sem limites), `documentos`, `cargas`, `provas-entrega`
(privados, 10 MiB, MIME restrito).

**pg_cron: 3 em produção, 1 na reconstrução.**
`criar-particoes-tracking` e `cf-expirar-anuncios` não estão em ficheiro
nenhum; `cf_expirar_documentos` está em `20260821_p1_trust_compliance.sql`. Os
três estão activos em produção — nenhum foi tocado nesta fase.

---

## H · `pg_temp` — o ataque, repetido

Corrido na base isolada, dentro de transação revertida.

**A função real, já endurecida:**

| Passo | Resultado |
|---|---|
| `current_app_user_id()` sem ataque | `<NULO>` |
| clone de controlo com o `search_path` antigo, sob ataque | **devolve o `id` da vítima** |
| `current_app_user_id()` real, sob o mesmo ataque | `<NULO>` |

O controlo é o que dá valor a isto: prova que o vector é real nesta base, e não
que o teste é fraco.

**Matriz sobre as seis tabelas pedidas:**

| Tabela | `search_path` antigo | endurecido | `public` real | Veredicto |
|---|---:|---:|---:|---|
| `users` | 7 | 0 | 0 | ataque bloqueado |
| `loads` | 7 | 0 | 0 | ataque bloqueado |
| `trips` | 7 | 0 | 0 | ataque bloqueado |
| `offers` | 7 | 0 | 0 | ataque bloqueado |
| `matches` | 7 | 0 | 0 | ataque bloqueado |
| `notifications` | 7 | 0 | 0 | ataque bloqueado |

**As 10 que ficam de fora.** Das 56 funções `SECURITY DEFINER`, 46 levaram
`pg_temp` e 10 não. Não aceitei que fossem seguras por leitura: abri as dez, e
as quatro que tocam em tabelas foram atacadas a sério, com uma `pg_temp.users`
a dizer que o atacante é `PLATFORM_ADMIN`, activo e não bloqueado.

| Função | Sob ataque | Esperado | |
|---|---|---|---|
| `current_user_id` | `<NULO>` | `<NULO>` | resistiu |
| `current_tenant_id` | `<NULO>` | `<NULO>` | resistiu |
| `is_platform_admin` | `false` | `false` | resistiu |
| `pode_operar` | `false` | `false` | resistiu |

Resistem porque escrevem `public.users` por extenso. As outras seis não tocam
em relação nenhuma. É protecção real, mas por qualificação e não por
`search_path` — o que significa que uma edição futura que acrescente uma
referência não qualificada reabre o buraco. `tests/sql-security.mjs` cobre isso
por regra estrutural, sem lista de excepções.

---

## I · Regressão

| Verificação | Resultado |
|---|---|
| `tests/seguranca-bloqueio.mjs` | 128 / 128 |
| `tests/trust-score.mjs` | 39 / 39 |
| `tests/elegibilidade-veiculo.mjs` | 41 / 41 |
| `tests/paridade-funcoes-sql.mjs` | 243 / 243 |
| `tests/sql-security.mjs` | 152 / 152 |
| `tests/schema.mjs` | 37 / 37 · 2 não testáveis |
| `tsc --noEmit` | sem erros |
| `next build` | passa, 40 rotas |
| `eslint .` | **5 erros — pré-existentes** |

Os 5 erros de lint estão em `components/entrega/galeria-fotos.tsx` (3) e
`components/shell/nav-mobile.tsx` (2), ficheiros que esta fase não tocou e que
estão intactos desde `600a160`. Não os corrigi porque não são desta fase; ficam
registados para não passarem por resolvidos.

O build local não alcança o Google Fonts. Substituí `next/font` por um esboço,
construí, repus o ficheiro e confirmei com `sha256sum -c` que
`app/layout.tsx` voltou byte a byte ao original.

---

## J · Erros meus, apanhados e corrigidos

Nesta fase, quatro:

1. **`\y` em JavaScript.** Os padrões novos de `tests/schema.mjs` usavam `\y`
   — fronteira de palavra no PostgreSQL, o literal «y» em JavaScript. Passavam
   sem olhar para nada. É o mesmo erro que já tinha apanhado do lado do SQL, e
   voltou pelo outro lado. Corrigido, e cada padrão passou a trazer uma **isca**:
   o teste verifica primeiro que o seu próprio padrão apanha a linha que
   procura, senão declara-se cego.
2. **Transcrição.** Ao copiar a lista de produção deixei cair
   `tracking_points_driver_id_fkey` e `_trip_id_fkey`, que apareciam seis vezes
   cada. Deu duas divergências falsas. Reposto e reconfirmado.
3. **`join` mal escrito** na comparação de índices — deu «tudo diferente»
   quando na verdade é tudo igual.
4. **Dados de teste inventados.** Adivinhei nomes de colunas e valores de enum
   em vez de os ler. Três tentativas falhadas até ir buscar o esquema real.

---

## K · O que ficou por fazer, e porquê

| | Porquê |
|---|---|
| As 39 políticas RLS | inventário primeiro, como pedido |
| Os 14 gatilhos | idem — mas é o item mais barato com maior efeito |
| Sequências, `wallet_transactions`, `wallet_status`, `vw_desvio_entregas` | idem |
| Baldes de storage e 2 jobs de cron | idem |
| A divergência `loads`/`trips` | não se resolve com trabalho, resolve-se com uma decisão |
| Os 5 erros de lint | pré-existentes, fora do âmbito |
| `shipment_photos` sem barreira RESTRICTIVE do P0 | documentado em fase anterior, continua por fechar |

Todo o passivo novo ficou travado em `tests/schema.mjs` §5 e §6: a lista pode
encolher, nunca crescer, e cada entrada prova que não é cega.

---

## L · Confirmação

| | |
|---|---|
| `HEAD` | `600a160` |
| `origin/main` | `600a160` |
| Ramo | `main` |
| Árvore de trabalho | **suja** — 5 ficheiros alterados, 14 novos, nenhum commitado |
| Produção alterada | **não** |
| Migration aplicada à produção | **não** — última registada continua `20260821105627` |
| Deployment | **não** |
| Cron alterado | **não** — os 3 jobs estão como estavam |
| Dados reais alterados | **não** |
| Credenciais | nenhuma copiada, criada, revelada ou escrita em ficheiro |

Verificado depois do trabalho todo: produção tem 103 políticas e 51 funções
`cf_*`, exactamente como no início desta fase.
