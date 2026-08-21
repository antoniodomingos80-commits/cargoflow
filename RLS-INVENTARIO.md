# Inventário do que a produção tem e o repositório não reconstrói

**21 de Agosto de 2026** · base `wneehgoeqipgdpprphdc` vs. base reconstruída `cf_novo`

Extraído do catálogo do PostgreSQL dos dois lados e comparado por nome e por
definição. Nada aqui foi corrigido — este documento é o levantamento que tem de
existir antes de se decidir o que fazer.

---

## 1. Políticas RLS

### 1.1 O saldo

| | Produção | Reconstruída |
|---|---:|---:|
| `public` | 103 | 66 |
| `storage.objects` | 11 | 4 |

A diferença de **−37** em `public` não são 37 omissões. São **41 políticas que a
produção tem e o repositório não cria**, menos **4 que o repositório cria e a
produção não tem**. As últimas quatro são o achado mais sério deste documento e
estão na §1.4.

Duas das 41 (`tracking_points_2026_12_read` e `_insert`) não são dívida: são
geradas por `criar_particao_tracking()` e faltam apenas porque a base
reconstruída criou 4 partições e a produção tem 5. Ficam 39 reais.

### 1.2 As 39, por tabela

Todas são `PERMISSIVE` e aplicam-se ao papel `public`.

| Tabela | Política | Cmd | USING / WITH CHECK |
|---|---|---|---|
| `agreements` | `agreements_parties` | SELECT | comerciante **ou** transportador **ou** dono da carga **ou** dono da viagem **ou** admin |
| `audit_logs` | `audit_admin_read` | SELECT | `is_platform_admin()` |
| `conversation_participants` | `conv_participants_own` | ALL | `user_id = current_app_user_id()` ou admin |
| `conversations` | `conversations_participants` | SELECT | participa na conversa, ou admin |
| `documents` | `documents_tenant` | ALL | `tenant_id = current_tenant_id()` ou admin · CHECK só empresa |
| `drivers` | `drivers_tenant` | ALL | idem |
| `load_attachments` | `load_attachments_follow_load` | ALL | `EXISTS (SELECT 1 FROM loads l WHERE l.id = load_id)` — **sem condição de empresa** |
| `loads` | `loads_read` | SELECT | `PUBLISHED` e autenticado · ou da empresa · ou transporta · ou tem proposta · ou admin |
| `loads` | `loads_insert` | INSERT | CHECK `tenant_id = current_tenant_id()` |
| `loads` | `loads_update` | UPDATE | empresa ou admin |
| `loads` | `loads_delete` | DELETE | empresa ou admin |
| `loads` | `loads_tenant_isolation` | ALL | empresa ou admin (USING e CHECK) |
| `locations` | `locations_read` | SELECT | `auth.uid() IS NOT NULL` |
| `locations` | `locations_insert` | INSERT | CHECK `auth.uid() IS NOT NULL` — **qualquer autenticado cria localidades** |
| `matches` | `matches_parties` | SELECT | dono da carga ou da viagem, ou admin |
| `messages` | `messages_participants` | SELECT | participa na conversa, ou admin |
| `messages` | `messages_send` | INSERT | CHECK remetente é o próprio **e** participa |
| `notifications` | `notifications_own` | ALL | `user_id = current_app_user_id()` |
| `offers` | `offers_parties` | SELECT | autor, ou dono da carga, ou dono da viagem, ou admin |
| `offers` | `offers_insert` | INSERT | CHECK `offered_by = current_app_user_id()` |
| `offers` | `offers_update` | UPDATE | autor, ou dono da carga, ou admin |
| `proof_of_delivery` | `pod_parties` | ALL | entregador, dono da carga, dono da viagem atribuída, ou admin |
| `reviews` | `reviews_read` | SELECT | `auth.uid() IS NOT NULL` — **todas as avaliações são públicas entre autenticados** |
| `reviews` | `reviews_insert` | INSERT | CHECK `reviewer_id = current_app_user_id()` |
| `tenants` | `tenants_own` | SELECT | a própria empresa, ou admin |
| `tenants` | `tenants_update` | UPDATE | idem |
| `tracking_events` | `tracking_events_parties` | SELECT | dono da carga, ou dono da viagem atribuída, ou admin |
| `tracking_events` | `tracking_events_insert` | INSERT | CHECK `created_by = current_app_user_id()` |
| `tracking_points` | `tracking_points_parties` | SELECT | dono da viagem, ou dono da carga atribuída, ou admin |
| `tracking_points` | `tracking_points_insert` | INSERT | CHECK a viagem é da empresa |
| `trips` | `trips_read` | SELECT | `PUBLISHED`/`PARTIALLY_BOOKED` e autenticado · ou da empresa · ou admin |
| `trips` | `trips_insert` | INSERT | CHECK `tenant_id = current_tenant_id()` |
| `trips` | `trips_update` | UPDATE | empresa ou admin |
| `trips` | `trips_delete` | DELETE | empresa ou admin |
| `trips` | `trips_tenant_isolation` | ALL | empresa ou admin (USING e CHECK) |
| `users` | `users_visible` | SELECT | o próprio, ou a mesma empresa, ou admin |
| `users` | `users_update_own` | UPDATE | `auth_user_id = auth.uid()` ou admin |
| `vehicles` | `vehicles_tenant` | ALL | empresa ou admin · CHECK só empresa |
| `wallet_transactions` | `wallet_select_own_tenant` | SELECT | utilizador activo da mesma empresa |

Três merecem ser olhadas quando chegar a altura de as versionar — não são
defeitos provados, são portas mais largas do que o resto do sistema:

- **`load_attachments_follow_load`** é `ALL` e a condição é apenas «a carga
  existe». Não menciona empresa nenhuma. Fica dependente da RLS de `loads`
  aplicada à subconsulta; qualquer carga visível traz consigo escrita nos
  anexos.
- **`locations_insert`** deixa qualquer autenticado inserir localidades. Não é
  absurdo (o catálogo é partilhado), mas é escrita não moderada.
- **`reviews_read`** torna todas as avaliações legíveis por qualquer
  autenticado, sem limite de empresa.

### 1.3 As 7 de `storage.objects`

Produção tem 11 políticas escritas à mão, por balde:

```
Avatares publicos para leitura      documentos_ler      cargas_ler
Utilizadores enviam o seu avatar    documentos_inserir  cargas_inserir
Utilizadores substituem o seu avatar documentos_apagar  cargas_apagar
provas_ler                          provas_inserir
```

A reconstrução cria 4, de `20260811_storage_rls.sql`, com outro desenho: uma
função `storage_object_belongs_to_current_tenant()` e três políticas genéricas
(`storage_objects_select/insert/delete_private_buckets`). **Nenhuma destas
existe em produção**, e a função também não.

### 1.4 A divergência — quatro políticas que só o repositório tem

Esta é a parte que não é omissão.

| Política | Onde vive | Existe em produção? |
|---|---|---|
| `loads_marketplace_read` | `20260811_enable_rls_core.sql`, `04-MODELO-DE-DADOS.sql` | **não** |
| `loads_owner_write` | idem | **não** |
| `trips_marketplace_read` | idem | **não** |
| `trips_owner_write` | idem | **não** |

Em produção, o lugar delas é ocupado por `loads_read`/`loads_insert`/
`loads_update`/`loads_delete` e pelos equivalentes de `trips` — que não existem
em ficheiro nenhum do repositório.

Alguém substituiu, à mão e directamente na produção, as regras de visibilidade
do mercado. **Aplicar o repositório a uma base nova não dá a plataforma que
está em serviço: dá outra, com regras de mercado diferentes.** Qual das duas é
a correcta é uma decisão de produto, não de engenharia, e por isso fica aqui
registada em vez de resolvida.

---

## 2. Gatilhos

14 gatilhos distintos em produção (17 linhas em `information_schema.triggers`,
que conta uma por evento) não são criados por ficheiro nenhum:

| Tabela | Gatilho | Quando | Função |
|---|---|---|---|
| `loads` | `trg_preparar_carga` | BEFORE INSERT OR UPDATE | `preparar_carga()` |
| `loads` | `trg_matches_carga` | AFTER INSERT/UPDATE de 10 colunas | `cf_trigger_matches_carga()` |
| `loads` | `trg_load_confirmed_at` | BEFORE UPDATE | `cf_trigger_load_confirmed_at()` |
| `loads` | `trg_wallet_release` | AFTER UPDATE | `cf_trigger_wallet_release()` |
| `trips` | `trg_preparar_viagem` | BEFORE INSERT | `preparar_viagem()` |
| `trips` | `trg_matches_viagem` | AFTER INSERT/UPDATE de 9 colunas | `cf_trigger_matches_viagem()` |
| `offers` | `trg_apos_criar_proposta` | AFTER INSERT | `cf_apos_criar_proposta()` |
| `offers` | `trg_match_resultado_oferta` | AFTER INSERT | `cf_trigger_match_resultado_oferta()` |
| `agreements` | `trg_match_resultado_acordo` | AFTER INSERT | `cf_trigger_match_resultado_acordo()` |
| `messages` | `trg_notificar_mensagem` | AFTER INSERT | `cf_notificar_mensagem()` |
| `documents` | `trg_documents_updated` | BEFORE UPDATE | `set_updated_at()` |
| `drivers` | `trg_drivers_updated` | BEFORE UPDATE | `set_updated_at()` |
| `tenants` | `trg_tenants_updated` | BEFORE UPDATE | `set_updated_at()` |
| `vehicles` | `trg_vehicles_updated` | BEFORE UPDATE | `set_updated_at()` |

**As funções existem todas** — foram versionadas com paridade MD5. O que falta
é o `CREATE TRIGGER` que as liga às tabelas. Uma função que ninguém dispara não
faz nada, e é por isso que a base reconstruída não consegue publicar uma carga.

---

## 3. Índices e restrições

Comparados **por definição**, não por nome: para cada tabela, o MD5 da
concatenação de todas as suas definições, ordenadas.

**62 de 62 conjuntos comparáveis são idênticos.** Zero divergências de
definição.

As diferenças de contagem (`−6` índices, `−8` restrições) explicam-se
inteiramente por duas tabelas que não existem na reconstrução:

| Tabela ausente | Índices | Restrições |
|---|---:|---:|
| `wallet_transactions` | 4 | 5 |
| `tracking_points_2026_12` | 2 | 3 |
| **total** | **6** | **8** |

---

## 4. Storage e tarefas agendadas

### Baldes — 4 em produção, 0 na reconstrução

Nenhuma migração os cria.

| Balde | Público | Limite | Tipos MIME |
|---|---|---|---|
| `avatares` | sim | sem limite | sem restrição |
| `documentos` | não | 10 MiB | jpeg, png, webp, pdf |
| `cargas` | não | 10 MiB | jpeg, png, webp |
| `provas-entrega` | não | 10 MiB | jpeg, png, webp |

### pg_cron — 3 em produção, 1 na reconstrução

| Tarefa | Horário | Produção | Versionada em |
|---|---|---|---|
| `criar-particoes-tracking` | `0 3 25 * *` | activa | — **nenhum ficheiro** |
| `cf-expirar-anuncios` | `7 * * * *` | activa | — **nenhum ficheiro** |
| `cf_expirar_documentos` | `10 3 * * *` | activa | `20260821_p1_trust_compliance.sql` |

---

## 5. Objectos usados e criados por ninguém

Encontrados porque a base reconstruída, apesar de **zero erros de migração**,
não conseguia inserir uma carga:

```
ERROR: null value in column "reference" of relation "loads"
```

| Objecto | Usado por | Criado por |
|---|---|---|
| `SEQUENCE seq_load_reference` | `preparar_carga()` | ninguém |
| `SEQUENCE seq_trip_reference` | `preparar_viagem()` | ninguém |
| `TABLE wallet_transactions` | `cf_trigger_wallet_hold/release` | ninguém |
| `TYPE wallet_status` | `wallet_transactions` | ninguém |
| `VIEW vw_desvio_entregas` | relatórios | ninguém |

Estes cinco, mais os 14 gatilhos, mais os 4 baldes, mais 2 tarefas de cron,
estão travados em `tests/schema.mjs` §5 como passivo conhecido: a lista pode
encolher, nunca crescer.
