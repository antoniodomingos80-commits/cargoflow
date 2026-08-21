# Plano de reconstrução do schema da CargoFlow

**21 de Agosto de 2026** · base de dados de produção `wneehgoeqipgdpprphdc`

Este documento responde a uma pergunta que até hoje ninguém tinha feito: *se
perdêssemos a base de dados, o repositório reconstruía-a?*

A resposta, medida e não estimada, é **não**. Mas está muito mais perto do que
estava, e o que falta é agora conhecido ao objecto.

---

## 1. O desvio, medido

Corri o `04-MODELO-DE-DADOS.sql` seguido de todas as migrações, por ordem,
contra uma base PostgreSQL 16 **vazia e isolada** montada para o efeito (com
PostGIS e com os esquemas `auth` e `storage` do Supabase simulados). Isto não é
uma análise — é a execução real.

Duas medições: a primeira tentativa, e depois das reparações da FASE 7.

| | 1.ª medição | Após FASE 7 | Produção |
|---|---:|---:|---:|
| Tabelas | 24 | 31 | 33 |
| Enums | 10 | 11 | 12 |
| Funções `cf_*` | 42 | **51** | 51 |
| Políticas RLS | 17 | 66 | 103 |
| Gatilhos | 15 | 17 | 34 |
| Índices | 75 | 102 | 108 |
| Vistas | 2 | 3 | 4 |
| Tabelas com RLS | 13 | 20 | 32 |
| **Migrações que falham** | 4 | **0** | — |

As 51 funções `cf_*` reconstroem-se agora todas, com paridade MD5. Os índices e
as restrições reconstroem-se **idênticos à definição**, sem uma única
divergência. O que falta está concentrado em três sítios: políticas RLS,
gatilhos, e um punhado de objectos que ninguém cria.

### O aviso que esta tabela não dá

Zero migrações a falhar **não** quer dizer base funcional. Depois da FASE 7 a
base reconstruída não falhava uma migração e continuava sem conseguir publicar
uma carga:

```
ERROR: null value in column "reference" of relation "loads"
```

`preparar_carga()` existia, mas o gatilho que a dispara não, e a sequência que
ela usa também não. **A FASE 8 fechou isso**: a base reconstruída executa agora
o percurso completo — carga, viagem, correspondência, proposta, acordo, rastreio
— com 12 de 12 etapas a passar (`npm run test:reconstruction`).

O inventário do que ainda falta está em `RLS-INVENTARIO.md`; o que foi fechado
está em `FASE8-RELATORIO.md`.

---

## 2. As quatro falhas, e as duas causas

Depois de corrigir dois defeitos meus (ver §3), restam quatro falhas com duas
causas de raiz.

### Causa A — `20260816_trust_layer_minimal.sql` está corrompido

```
psql: error: invalid command \
```

O ficheiro tem duas coisas erradas:

1. Começa com um **BOM** (`EF BB BF`), invisível num editor.
2. A linha 2 escreve `AS \$\ BEGIN … END; \$\` em vez de `AS $$ … $$`. As
   aspas em dólar estão escapadas como se o ficheiro tivesse passado por uma
   camada de shell antes de ser gravado.

O `psql` interpreta o `\` no início como meta-comando e desiste. **Esta
migração nunca foi replayável** — chegou à produção por outra via, muito
provavelmente colada no editor SQL do painel, que trata o texto de outra
maneira.

Cascata: sem ela não existem `verification_requirements` nem
`verification_audit_log`, e caem também `20260819_trust_requirements_seed`,
`20260821_p1_trust_compliance` e `20260822_hardening_pg_temp`.

### Causa B — `users.banned` não é criada por nenhuma migração

```
ERROR: column u.banned does not exist
```

`20260819_p0_bloqueio_operacional.sql` e
`20260821_p1_blindagem_campos_administrativos.sql` **usam** a coluna; nenhum
ficheiro do repositório a **cria**. Foi acrescentada à produção à mão.

É o mesmo padrão do `UNDER_REVIEW` que eu próprio deixei escapar (§3) — e é a
razão pela qual a regra «nada entra na produção fora de uma migração» tem de
ser mais do que uma boa intenção.

---

## 3. Dois defeitos meus, já corrigidos

O teste apanhou-os antes de o senhor os apanhar, que é como devia ser.

| Defeito | Como se manifestava | Correcção |
|---|---|---|
| `ALTER TYPE … 'UNDER_REVIEW'` corrido à mão a 21/08 e nunca posto em migração | `invalid input value for enum verification_status` | criado `20260820_enum_under_review.sql`, em ficheiro próprio porque `ADD VALUE` não pode partilhar transação com o uso |
| Migrações de hardening chamadas `20260821_hardening_*` | «hardening» ordena **antes** de «p1» e «versionar», por isso corriam antes das funções existirem | renomeadas para `20260822_hardening_*` |

O segundo é instrutivo: o prefixo de data não chega. Dentro do mesmo dia, a
ordem é alfabética, e `hardening` < `p1` < `versionar`.

---

## 4. Ordem de reconstrução

A sequência que funciona, por camadas. Cada uma só depende das anteriores.

### Camada 0 — Fundações da instância
Fora do repositório: é o que o Supabase fornece.
```
extensões: uuid-ossp, pgcrypto, postgis, pg_cron
esquemas:  auth (com auth.uid(), auth.role()), storage
papéis:    anon, authenticated, service_role
```

### Camada 1 — Tipos
```
12 enums: user_role, verification_status, load_status, trip_status,
          vehicle_type, cargo_type, offer_status, document_type,
          payment_provider, payment_status, wallet_status,
          verification_action
```
`verification_status` inclui `UNDER_REVIEW` — ver `20260820_enum_under_review.sql`.
Os enums vêm sempre primeiro: as colunas dependem deles.

### Camada 2 — Funções auxiliares sem dependências de tabelas
```
unaccent_simples, gerar_referencia, set_updated_at, set_payments_updated_at,
cf_raio_tolerancia_m, cf_viagem_por_partir
```
Antes das tabelas, porque alguns `DEFAULT` e gatilhos as invocam.

### Camada 3 — Tabelas, por ordem de chaves estrangeiras
```
1. tenants, locations                       (sem dependências)
2. users                                    (→ tenants)
3. vehicles, drivers, documents             (→ tenants, users)
4. loads, trips                             (→ tenants, users, locations, vehicles)
5. matches, offers                          (→ loads, trips)
6. agreements                               (→ loads, trips, offers, users)
7. conversations, conversation_participants, messages
8. tracking_points (particionada), tracking_events, proof_of_delivery,
   shipment_photos, load_attachments
9. reviews, notifications, audit_logs, wallet_transactions, payments
10. user_blocklist, verification_requirements, verification_audit_log
```
`shipment_photos` já tem migração: `20260821_versionar_shipment_photos.sql`.

### Camada 4 — Partições de `tracking_points`
```
RANGE (recorded_at), uma por mês
criar_particao_tracking(ano, mes) cria a partição, activa RLS e cria as
  duas políticas de leitura e inserção
cf_garantir_particoes_futuras() chama-a para os 4 meses seguintes
```
Em produção existem 5 (2026_08 a 2026_12). Uma base nova só precisa de chamar
`cf_garantir_particoes_futuras()` uma vez — as partições passadas só fazem
falta se houver dados históricos para restaurar.

### Camada 5 — Funções de contexto e segurança
```
current_tenant_id, current_user_id, current_app_user_id,
is_platform_admin, is_verified_user, pode_operar,
escrita_administrativa_permitida
```
Dependem de `users` e são usadas por quase todas as políticas RLS. Têm de
existir antes da Camada 7.

### Camada 6 — Funções de negócio
```
as 51 cf_*, por ordem de dependência interna:
  cf_pontuar_correspondencia → cf_calcular_matches_* → cf_trigger_matches_*
  cf_trust_score → cf_recalcular_trust_score → cf_recalcular_trust_scores
```
Já versionadas em `20260821_versionar_funcoes_rastreio.sql` e
`20260821_versionar_funcoes_negocio.sql`, ambas com paridade MD5 provada
contra a produção.

### Camada 7 — Segurança
```
ENABLE ROW LEVEL SECURITY nas 32 tabelas
103 políticas em public + 11 em storage
  · permissivas de isolamento por empresa
  · 37 RESTRICTIVE (36 do P0 com pode_operar() + 1 de elegibilidade de veículo)
GRANTs por papel
REVOKEs (cf_calcular_matches_*, cf_viagem_por_partir, funções de trust)
```
**É aqui que está o maior buraco: 17 de 103 reconstroem-se hoje.**

### Camada 8 — Gatilhos
```
34 gatilhos, entre eles:
  set_updated_at em 8 tabelas
  zz_proteger_campos_admin em 5 (blindagem administrativa)
  zz_trips_veiculo_elegivel
  preparar_carga, preparar_viagem, recalculate_user_rating
  cf_trigger_* de matching e carteira
  handle_new_auth_user em auth.users
```
Depois das funções, obviamente. `zz_*` no fim, pela ordem alfabética de
disparo.

### Camada 9 — Índices
```
108 índices, dos quais 33 fora do repositório
```
Depois dos dados, se houver restauro: criar índices antes de carregar dados é
mais lento.

### Camada 10 — Storage
```
4 buckets: documentos, provas-entrega, cargas (privados), avatares (público)
11 políticas em storage.objects
limites de tamanho e tipos MIME por bucket
```
Parcialmente em `20260811_storage_rls.sql`. **A criação dos buckets não está
versionada** — só as políticas.

### Camada 11 — Dados de semente
```
locations (as cidades e províncias de Angola)
verification_requirements (13 requisitos por perfil)
```
`20260819_trust_requirements_seed.sql` cobre o segundo. **As localidades não
estão versionadas** — sem elas não se publica uma carga.

### Camada 12 — Tarefas agendadas
```
3 jobs pg_cron:
  criar-particoes-tracking   0 3 25 * *   activo
  cf-expirar-anuncios        7 * * * *    activo
  cf_expirar_documentos      10 3 * * *   ← estado por decidir
```
**Nenhum está versionado.** O terceiro está em
`20260821_p1_trust_compliance.sql` mas os dois primeiros não existem em
ficheiro nenhum.

---

## 5. O que falta, em concreto

Por ordem de esforço crescente:

| # | O quê | Estado | Esforço |
|---|---|---|---|
| 1 | Reparar `20260816_trust_layer_minimal.sql`: tirar o BOM, trocar `\$\` por `$$` | **feito** | — |
| 2 | Criar migração para `users.banned` e outras colunas manuais | **feito** (12 colunas) | — |
| 3 | Separar as 10 auxiliares para uma data anterior às que delas dependem | **feito** | — |
| 4 | Criar `20260820_enum_under_review.sql` | **feito** | — |
| 5 | Renomear as migrações de hardening para `20260822_` | **feito** | — |
| 6 | **Os 14 gatilhos em falta** — sem eles não se publica uma carga | **feito** (FASE 8, +1 em `auth`) | — |
| 7a | As 2 sequências de referência, 3 colunas órfãs, `trips.waypoints`, arranque das partições | **feito** (FASE 8) | — |
| 7b | `wallet_transactions`, `wallet_status`, `vw_desvio_entregas` | por fazer | duas horas |
| 8 | **As 39 políticas RLS em falta, e RLS activada em 9 tabelas** | por fazer — especificado em `SECURITY-MODEL-TARGET.md` §5 | meio dia |
| 9 | **Decidir a divergência de `loads`/`trips`** — o repositório e a produção têm regras de mercado diferentes | por fazer | decisão de produto |
| 10 | Versionar os 4 baldes de storage e alinhar as 11 políticas | por fazer | duas horas |
| 11 | Versionar os 2 jobs pg_cron em falta | por fazer | minutos |
| 12 | Versionar as localidades de Angola (semente) | por fazer | uma hora |
| 13 | Reorganizar `04-MODELO-DE-DADOS.sql` como `00000000_schema_base.sql` | por fazer | meio dia |

Os pontos 1 a 5 estão fechados e foram o que desbloqueou a cascata. O **6** é o
mais barato com maior efeito: repõe a base como coisa utilizável. O **8** é o
que fecha o buraco de segurança. O **9** não se resolve com trabalho — resolve-se
com uma decisão, e está descrito em `RLS-INVENTARIO.md` §1.4.

---

## 5b. O que a auditoria de segurança acrescentou a esta lista

As Fases 9 e 10 mediram três coisas que mudam a leitura da tabela acima, e que
estão especificadas em `SECURITY-MODEL-TARGET.md`:

1. **Não são só políticas que faltam — falta RLS.** Nove tabelas
   (`audit_logs`, `conversations`, `conversation_participants`, `load_attachments`,
   `locations`, `matches`, `proof_of_delivery`, `reviews`, `tracking_events`)
   reconstroem-se **sem Row Level Security**. Numa tabela sem RLS as políticas
   são decorativas e mandam os `GRANT`, que dão tudo a toda a gente.

2. **Cinco dessas nove já têm barreira RESTRICTIVE — e ela é inerte.** As
   políticas `*_bloqueio_*` do P0 estão criadas em tabelas com RLS desligada.
   Lê-se o catálogo, vê-se a barreira, e ela não faz nada. É pior do que não
   existir, porque induz confiança.

3. **`offers` e `agreements` negam tudo.** Têm RLS activa e só políticas
   RESTRICTIVE. Medido: o dono de uma proposta vê zero das suas próprias.

Consequência para este plano: o ponto 8 não é «copiar 39 políticas». É activar
RLS e criar a política permissiva **no mesmo comando**, tabela a tabela —
activar RLS antes de haver permissiva tranca a tabela.

---

## 6. Como voltar a correr este teste

A base de teste foi montada assim, e pode ser refeita a qualquer momento:

```bash
apt-get install -y postgresql-16 postgresql-16-postgis-3
initdb -D /tmp/pgdata -A trust
pg_ctl -D /tmp/pgdata -o "-p 55432 -k /tmp/pgrun" start
createdb -h /tmp/pgrun -p 55432 cf_teste
psql -h /tmp/pgrun -p 55432 -d cf_teste -f bootstrap.sql   # arreios do Supabase
psql -h /tmp/pgrun -p 55432 -d cf_teste -f 04-MODELO-DE-DADOS.sql
for f in supabase/migrations/*.sql; do
  psql -h /tmp/pgrun -p 55432 -d cf_teste -v ON_ERROR_STOP=1 -f "$f"
done
```

**Um aviso sobre a detecção de erros.** A minha primeira tentativa deu um
falso OK em `20260816_trust_layer_minimal.sql`: o `psql` sai com **código 0**
quando falha num meta-comando inválido, e escreve `error:` em minúsculas em
vez de `ERROR:`. Quem repetir isto tem de procurar as duas formas e não
confiar no código de saída.

---

## 7. Uma nota sobre o que este exercício mostrou

O valor de correr isto não foi confirmar que faltavam coisas — isso já se
suspeitava. Foi descobrir *quais*, e em que ordem, e apanhar dois defeitos
meus que só se veem numa base vazia. Uma migração que nunca foi replayada não
é uma migração; é um registo de que alguém, um dia, correu qualquer coisa.
