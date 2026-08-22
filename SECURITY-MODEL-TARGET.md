# Modelo-alvo de segurança da CargoFlow

**21 de Agosto de 2026** · especificação técnica, não implementação

Este documento fecha as Fases 1–9. Não introduz medições novas: consolida o que
já foi medido e transforma-o numa especificação pronta a executar. Nada aqui foi
aplicado.

Fonte das medições: `FASE7-RELATORIO.md` (reconstrução), `FASE8-RELATORIO.md`
(gatilhos e fluxo funcional), `FASE9-AUDITORIA-RLS.md` (matriz de visibilidade),
`RLS-INVENTARIO.md` (inventário política a política).

---

## 1. Estado actual

Duas realidades divergentes, ambas medidas por execução:

| | Produção | Repositório |
|---|---:|---:|
| Tabelas com RLS | **31 / 31** | **20 / 29** |
| Tabelas com RLS forçada (`FORCE`) | 0 | 0 |
| Políticas em `public` | 103 | 66 |
| Políticas em `storage` | 11 | 4 (desenho diferente) |
| Funções `SECURITY DEFINER` | 55 | 56 |
| …sem `pg_temp` no `search_path` | **55** | 10 |
| Gatilhos | 27 | 27 (paridade provada) |
| GRANTs fora do padrão Supabase | 0 | 0 |
| Isolamento entre empresas (22 sondas) | **22 / 22** | 20 / 22 |

O `FORCE ROW LEVEL SECURITY` está desligado dos dois lados. É o comportamento
normal do Supabase — o dono das tabelas é `postgres` e a aplicação nunca se
liga como dono. Só passaria a importar se alguma rotina passasse a correr como
dono; não é o caso, e não recomendo mexer.

### Diff mecânico, classificado

`A` = necessária · `B` = perigosa · `C` = provavelmente intencional · `D` = precisa de decisão funcional

| Tabela | Repositório | Produção | Classe |
|---|---|---|---|
| `agreements` | RLS on, 0 perm, 3 restr | RLS on, 1 perm, 3 restr | **B** — nega tudo |
| `offers` | RLS on, 0 perm, 3 restr | RLS on, 3 perm, 3 restr | **B** — nega tudo |
| `conversations` | **RLS off**, 3 restr | RLS on, 1 perm, 3 restr | **B** — barreira inerte |
| `conversation_participants` | **RLS off**, 3 restr | RLS on, 1 perm, 3 restr | **B** — barreira inerte |
| `load_attachments` | **RLS off**, 3 restr | RLS on, 1 perm, 3 restr | **B** — barreira inerte |
| `proof_of_delivery` | **RLS off**, 3 restr | RLS on, 1 perm, 3 restr | **B** — barreira inerte |
| `reviews` | **RLS off**, 3 restr | RLS on, 2 perm, 3 restr | **B** — barreira inerte |
| `audit_logs` | **RLS off** | RLS on, 1 perm | **B** — sem RLS |
| `locations` | **RLS off** | RLS on, 2 perm | **B** — sem RLS |
| `matches` | **RLS off** | RLS on, 1 perm | **B** — sem RLS |
| `tracking_events` | **RLS off** | RLS on, 2 perm | **B** — sem RLS |
| `loads` | 2 perm | 5 perm | **D** — visibilidade do mercado |
| `trips` | 2 perm | 5 perm | **D** — visibilidade do mercado |
| `documents`, `drivers`, `vehicles`, `messages`, `notifications`, `tenants`, `users` | menos 1 a 2 permissivas | — | **D** — políticas em falta |
| `wallet_transactions` | ausente | RLS on, 1 perm | **C** — tabela por versionar |
| `payments`, `shipment_photos`, `user_blocklist`, `verification_audit_log`, `verification_requirements` | iguais | iguais | — |

**21 de 26 tabelas divergem. 11 são classe B.**

A classe mais desagradável é a **barreira inerte**: cinco tabelas têm as três
políticas `*_bloqueio_*` RESTRICTIVE criadas pelo P0, e RLS desligada. Uma
política numa tabela sem RLS não faz nada. Lê-se o catálogo, vê-se a barreira,
e ela não existe. É pior do que não a ter, porque induz confiança.

---

## 2. Problemas confirmados

Todos medidos, nenhum inferido.

1. **Nove tabelas sem RLS no repositório.** Consequência medida: a empresa A lê
   o rastreio da empresa B (`FASE9 §4`).
2. **`offers` e `agreements` negam tudo no repositório.** Medido: o utilizador B
   vê 0 das suas 3 próprias propostas.
3. **Marketplace anónimo no repositório.** Medido: `anon` lê cargas e viagens
   publicadas, incluindo `budget_amount` e o texto livre da descrição.
4. **Conta bloqueada apaga fotos de expedição.** Medido contra as políticas da
   produção. `shipment_photos` não tem barreira.
5. **Conta bloqueada carrega documentos e regista rastreio.** Mesma causa.
6. **55 funções `SECURITY DEFINER` sem `pg_temp` em produção.** O ataque de
   sombra foi provado na FASE 7 e a correcção está escrita e por aplicar.
7. **`cf_avaliacoes_da_carga` com guarda mais fraca que a irmã `cf_prova_entrega`.**
   Correcção escrita e por aplicar.

---

## 3. Modelo-alvo

Cinco invariantes. Tudo o resto decorre deles.

**I. Toda a tabela de `public` tem RLS activada.** Sem excepções negociáveis.
Uma tabela sem RLS é governada pelos `GRANT`, e os `GRANT` dão tudo a toda a
gente.

**II. Toda a tabela com RLS tem pelo menos uma política PERMISSIVE.** RESTRICTIVE
faz `AND`; sozinha, nega tudo.

**III. Toda a tabela que aceita escrita de `authenticated` tem uma barreira
RESTRICTIVE com `pode_operar()`.** A excepção estrutural são as tabelas onde
`authenticated` não tem privilégio de escrita — e hoje não há nenhuma.

**IV. Toda a função `SECURITY DEFINER` qualifica as relações que usa ou tem
`pg_temp` no `search_path`.** As duas coisas resolvem; falta das duas expõe.

**V. O repositório reconstrói a produção.** Enquanto divergirem, uma das duas
está errada e não se sabe qual.

O invariante **III** contava-se mal ao princípio: 13 tabelas, a partir de «tem
`GRANT` de escrita?». A contagem certa é por comando — *existe política
permissiva que autorize este INSERT/UPDATE/DELETE?* Depois de
`20260828_bloqueio_tabelas_restantes.sql`, restam **16 combinações
tabela+comando em 7 tabelas**, e nenhuma delas é omissão: são as decisões
tratadas uma a uma em §5.

---

## 4. Prioridades

### P0 — segurança quebrada

| # | O quê | Onde | Consequência medida |
|---|---|---|---|
| P0-1 | RLS desligada em 9 tabelas | repositório | A lê rastreio de B |
| P0-2 | Marketplace sem exigir sessão | repositório | `anon` lê orçamento e contacto |
| P0-3 | 55 funções DEFINER sem `pg_temp` | **produção** | roubo de identidade, provado na FASE 7 |

`P0-3` é o único que está vivo em produção neste momento. Os outros dois são o
que aconteceria ao aplicar o repositório.

### P1 — perda de funcionalidade ou barreira em falta

| # | O quê | Onde |
|---|---|---|
| P1-1 | `offers` e `agreements` negam tudo | repositório |
| P1-2 | Conta bloqueada apaga fotos de expedição | ambos |
| P1-3 | Conta bloqueada carrega documentos e regista rastreio | ambos |
| P1-4 | `cf_avaliacoes_da_carga` com guarda fraca | produção |
| P1-5 | Políticas em falta em 7 tabelas | repositório |

### P2 — arquitectura

| # | O quê |
|---|---|
| P2-1 | `anon` tem `TRUNCATE`; `TRUNCATE` não passa por RLS |
| P2-2 | `anon` tem `USAGE` nas sequências de referência |
| P2-3 | `cf_trigger_*` com `EXECUTE` para `anon` |
| P2-4 | `load_attachments_follow_load` só verifica que a carga existe |
| P2-5 | `locations_insert` aberta a qualquer autenticado |
| P2-6 | 39 políticas, 11 de storage, 4 baldes e 2 tarefas de cron por versionar |
| P2-7 | `wallet_transactions`, `wallet_status`, `vw_desvio_entregas` por versionar |

### P3 — melhoria

`avatares` sem `DELETE`; confirmar que `reviews_read` aberta é desenho;
confirmar que `provas-entrega` sem `DELETE` é imutabilidade intencional.

---

## 5. Políticas a reconciliar

**Nenhuma política de produção deve ser copiada sem ser lida.** A lista abaixo
diz o que fazer, não «igualar à produção».

| Tabela | Operação | Papel | Repositório | Produção | Risco | Alvo |
|---|---|---|---|---|---|---|
| `loads` | SELECT | anon | vê publicadas | bloqueado | **P0** | **decisão §9** |
| `loads` | SELECT | auth | publicadas + próprias | + transportador atribuído + quem tem proposta | perda de acesso legítimo | adoptar os ramos da produção |
| `trips` | SELECT | anon | vê publicadas | bloqueado | **P0** | **decisão §9** |
| `offers` | SELECT | auth | **nada** | autor, dono da carga, dono da viagem, admin | mercado invisível | adoptar a da produção |
| `agreements` | SELECT | auth | **nada** | partes + empresas + admin | acordos invisíveis | adoptar a da produção |
| `tracking_events` | SELECT | todos | **sem RLS** | empresa da carga ou da viagem | **P0** | activar RLS + política da produção |
| `matches` | SELECT | todos | **sem RLS** | dono da carga ou da viagem | fuga de correspondências | activar RLS + política da produção |
| `conversations` | SELECT | todos | **sem RLS** | participantes | fuga de conversas | activar RLS + política da produção |
| `conversation_participants` | ALL | todos | **sem RLS** | o próprio | fuga de participantes | activar RLS + política da produção |
| `proof_of_delivery` | ALL | todos | **sem RLS** | partes da operação | fuga de provas | activar RLS + política da produção |
| `reviews` | SELECT | todos | **sem RLS** | qualquer autenticado | reputação exposta a anónimos | activar RLS; **confirmar** se autenticado é o alvo |
| `load_attachments` | ALL | todos | **sem RLS** | «a carga existe» | fuga de anexos | activar RLS **e corrigir**: acrescentar condição de empresa (P2-4) |
| `audit_logs` | SELECT | todos | **sem RLS** | só admin | trilha de auditoria legível | activar RLS + política da produção |
| `locations` | SELECT/INSERT | todos | **sem RLS** | autenticado | catálogo aberto | activar RLS; **rever** se INSERT deve ser de admin (P2-5) |
| `shipment_photos` | I/U/D | auth | sem barreira | sem barreira | **P1** | criar `shipment_photos_bloqueio_*` |
| `documents` | I/U/D | auth | sem barreira | sem barreira | **P1** | criar `documents_bloqueio_*` |
| `tracking_events`, `tracking_points` | INSERT | auth | sem barreira | sem barreira | **P1** | criar barreira |

### Quais precisam mesmo de barreira

A primeira versão desta secção contava treze tabelas, a partir da pergunta
«tem `GRANT` de escrita?». A pergunta estava errada: os `GRANT` do Supabase dão
tudo a toda a gente, e várias dessas tabelas já negam a escrita por não terem
política **permissiva** nenhuma que a autorize. Sem permissiva não há nada que
uma barreira possa travar.

A pergunta certa é por comando: *existe uma política PERMISSIVE que autorize
este INSERT/UPDATE/DELETE?* Medido a 21/08/2026:

- **já negadas, nada a fazer:** `audit_logs`, `matches`, `tracking_points` —
  nenhuma política permissiva de escrita;
- **levam barreira** (feito em `20260828_bloqueio_tabelas_restantes.sql`):
  `shipment_photos`, `documents`, `tracking_events`, `locations`;
- **não levam barreira, e porquê:** abaixo.

### As que ficam sem barreira

- **`users`** — `users_update_self_or_admin` é `(id = current_user_id()) OR
  is_platform_admin()`. Uma conta suspensa tem de poder editar o próprio perfil,
  nem que seja para corrigir dados e pedir revisão. Decisão fechada.

- **`verification_audit_log`** — `verification_audit_log_admin_only` é
  `is_platform_admin()`, sem mais alternativas. Um utilizador comum suspenso já
  não escreve. Além disso é trilha de auditoria: travá-la impediria registar a
  própria decisão administrativa. Decisão fechada.

- **`verification_requirements`** — `verification_requirements_admin_write` é
  `is_platform_admin()`. Tabela de configuração. Decisão fechada.

- **`notifications`** — ver §5.1.
- **`tenants`** — ver §5.2.
- **`payments`** e **`user_blocklist`** — ver §5.3 e §5.4.

---

### 5.1 `notifications` — a política é mais larga do que a justificação

**O que estava escrito aqui:** «marcar como lida não é uma operação de negócio».

**O facto:** `notifications_own_only` é `FOR ALL`, com
`(user_id = current_user_id()) OR is_platform_admin()` em `USING` e em
`WITH CHECK`. Cobre portanto:

| Operação | Quem | Protegida por |
|---|---|---|
| SELECT | o dono da notificação, ou admin | a mesma política |
| UPDATE | idem — é aqui que cabe marcar como lida | a mesma política |
| INSERT | idem — o dono pode criar notificações a si próprio | a mesma política |
| DELETE | idem — o dono pode apagar as suas | a mesma política |

A justificação original cobria só o UPDATE. As outras três continuam sem
justificação escrita.

**O que se sabe:** a RLS garante que ninguém toca nas notificações de outra
pessoa — isso está provado e não é o que está em causa. O que a barreira
`pode_operar()` mudaria é se uma conta **suspensa** pode continuar a marcar
como lida, a criar e a apagar notificações suas.

**Decisão em aberto:** *uma conta suspensa deve poder apagar as suas próprias
notificações?* Apagar não afecta ninguém além do próprio, mas remove o rasto do
que lhe foi comunicado — incluindo, possivelmente, o aviso da própria suspensão.
Marcar como lida é inofensivo. Não é a mesma pergunta para as quatro operações,
e por isso não fica decidida em bloco.

---

### 5.2 `tenants` — a justificação anterior era factualmente errada

**O que estava escrito aqui:** que `tenants` estava «já restrita a admin ou a
`service_role` por política».

**Isso é falso.** A política real é

```sql
tenants_update_own_or_admin  UPDATE
  USING      ((id = current_tenant_id()) OR is_platform_admin())
  WITH CHECK ((id = current_tenant_id()) OR is_platform_admin())
```

Qualquer utilizador autenticado da empresa — não só um administrador dela, nem
só um administrador de plataforma — pode alterar os dados do seu próprio tenant:
nome, `slug`, `tax_id`, moeda, país, `is_active`. A decisão de não pôr barreira
assentava numa premissa que não se verifica, portanto **não está fundamentada** e
volta a estar em aberto.

**Duas perguntas distintas, e nenhuma delas é minha:**

1. *Um membro qualquer da empresa deve poder alterar os dados dela?* Hoje pode.
   Se a resposta for não, a correcção não é uma barreira de conta bloqueada — é
   apertar a própria `tenants_update_own_or_admin` a papéis de administração.
2. *Uma conta suspensa deve poder alterar os dados da empresa?* Se a resposta
   for não, então `tenants` leva `tenants_bloqueio_update`.

São independentes: pode responder-se sim à primeira e não à segunda.

**Estado:** nada alterado. Sem barreira, e agora sem justificação a fingir que
há uma.

---

### 5.3 `payments` — analisado, decisão de produto pendente

Medido a 21/08/2026, sem alterar nada:

- `payments_insert_own_tenant` (INSERT) — `tenant_id = current_tenant_id() OR
  is_platform_admin()`: um utilizador comum da empresa cria pagamentos;
- `payments_update_platform_admin` (UPDATE) — só administrador de plataforma;
- sem política de DELETE: apagar está negado.

**Nenhuma função `SECURITY DEFINER` escreve em `payments`.** E `service_role`
tem `BYPASSRLS = true`, ao contrário de `anon` e `authenticated`. Logo uma
barreira RESTRICTIVE **não afectaria processos internos** — só o cliente.

Tecnicamente a barreira no INSERT é segura. O que falta é a resposta de produto:
**uma conta suspensa deve poder liquidar uma obrigação que já contraiu?**
Travar protege contra movimentos de uma conta sob suspeita; não travar evita
deixar um acordo em curso por pagar.

---

### 5.4 `user_blocklist` — analisado, recomendação: não pôr barreira

Política real: `is_platform_admin() OR (blocked_by = current_user_id() AND
tenant_id = current_tenant_id())`. Nenhuma função `SECURITY DEFINER` escreve na
tabela.

Dois factos medidos:

1. A barreira seria **redundante** contra um utilizador comum suspenso — ele já
   não escreve, por não ser administrador nem autor do bloqueio.
2. A produção tem **um único administrador de plataforma activo**. Se essa conta
   for bloqueada, `pode_operar()` passa a falso e ninguém desbloqueia pela
   aplicação; restaria `service_role` ou acesso directo à base.

Ganho nulo, risco concreto. **Recomendação: não criar a barreira.** Fica aqui
registada para não voltar a ser levantada como omissão.

---

## 6. GRANTs

Uniformes nos dois lados, sem uma única anomalia. Classificação:

| Privilégio | Classificação | Acção |
|---|---|---|
| SELECT, INSERT, UPDATE, DELETE a `anon`/`authenticated`/`service_role` | **infraestrutura Supabase esperada e necessária** | manter; é assim que o PostgREST funciona, com a RLS a decidir |
| REFERENCES, TRIGGER | infraestrutura, inofensivo | manter |
| **TRUNCATE a `anon`** | **excessivo** | rever — é o único privilégio da lista que **não passa por RLS** |
| USAGE nas sequências `seq_*` a `anon` | excessivo | revogar de `anon`; queima números de referência |
| — | **por versionar** | os `ALTER DEFAULT PRIVILEGES` do Supabase não estão em migração; uma base montada fora do Supabase nasce sem eles e a aplicação não lê uma linha |

Sobre o `TRUNCATE`: o PostgREST não o expõe, portanto não há caminho conhecido a
partir da API. Continua a ser a única concessão que atravessa a RLS. **Não
mexer sem confirmar que nenhuma ferramenta interna depende dele.**

---

## 7. RLS

Alvo: **31 de 31**, `FORCE` desligado.

O trabalho é uma migração com nove `ALTER TABLE … ENABLE ROW LEVEL SECURITY` e
as políticas permissivas que cada uma precisa. A ordem importa: **activar RLS
antes de existir uma política permissiva tranca a tabela**. Cada tabela tem de
ganhar RLS e política no mesmo comando, ou a plataforma fica sem leitura entre
as duas migrações.

---

## 8. SECURITY DEFINER

Alvo: nenhuma função `SECURITY DEFINER` com referência não qualificada e sem
`pg_temp`.

O repositório já lá está — as 46 endurecidas mais 10 que qualificam
`public.<tabela>` no corpo, verificadas uma a uma na FASE 7. **A produção não**:
55 de 55 estão expostas, porque a migração de endurecimento nunca foi aplicada.

`20260822_hardening_pg_temp.sql` e `20260822_hardening_funcoes_sql.sql` estão
escritas, testadas em base isolada, e são as duas únicas alterações desta lista
que valem por si sem depender de decisão nenhuma.

---

## 9. Marketplace

A decisão continua por tomar. A recomendação da FASE 9 mantém-se: **Opção C**,
página pública limitada com dados completos só para quem tem sessão.

O que muda com cada escolha:

- **A (público)** — o repositório fica como está; o P0-2 deixa de ser um achado e
  passa a ser desenho. Aceita-se que orçamento e texto livre da carga sejam
  públicos, porque a RLS isola linhas e não colunas.
- **B (autenticado)** — alinhar o repositório com a produção. É o caminho mais
  curto: elimina o P0-2 e metade da tabela do §5.
- **C (limitado)** — B mais uma vista pública com as colunas escolhidas e a sua
  própria política.

Nas três, o resto deste documento não muda. **Os P0-1, P0-3 e os P1 são
independentes da decisão do marketplace** e podem ser feitos antes.

---

## 10. Plano de implementação

Quatro lotes, do que não depende de ninguém para o que depende de decisão.

### Lote 1 — produção, sem depender de decisão

```
20260822_hardening_funcoes_sql.sql     já escrita
20260822_hardening_pg_temp.sql         já escrita
```

Fecha o **P0-3** e o **P1-4**. Não altera comportamento legítimo: foi provado em
base isolada que as funções continuam a devolver o mesmo, e que o ataque de
sombra deixa de funcionar.

### Lote 2 — repositório, sem depender de decisão

```
20260826_rls_tabelas_em_falta.sql
  · ENABLE ROW LEVEL SECURITY nas 9
  · as políticas permissivas de cada uma, no mesmo ficheiro
  · as permissivas em falta de offers e agreements
```

Fecha o **P0-1**, o **P1-1** e o **P1-5**. É o lote maior e o que mais precisa de
ser lido com atenção, porque activar RLS sem política permissiva tranca a tabela.

### Lote 3 — barreiras de conta bloqueada — **feito**

```
20260828_bloqueio_tabelas_restantes.sql
  · shipment_photos   INSERT, UPDATE, DELETE
  · documents         INSERT, UPDATE, DELETE
  · tracking_events   INSERT
  · locations         INSERT
```

Fecha o **P1-2** e o **P1-3**. `tracking_points` e `matches` estavam na lista
original e saíram: não têm política permissiva de escrita, portanto já negavam.
`locations` entrou pela mesma medição. Provado com 17 sondas, conta activa e
conta suspensa, 0 inconclusivas.

### Lote 4 — depois da decisão do marketplace

Conteúdo conforme a opção escolhida. Fecha o **P0-2**.

### Depois, e sem pressa

Os P2: revogar `TRUNCATE` e `USAGE` de `anon`, `EXECUTE` dos `cf_trigger_*`,
corrigir `load_attachments_follow_load`, versionar baldes, cron, sementes e
`wallet_transactions`.

### Ordem entre lotes

O Lote 1 pode ir sozinho para produção. Os Lotes 2 e 3 são de repositório e só
chegam à produção quando alguém decidir aplicá-los — e nessa altura o Lote 2
deve ir **antes** do 3, porque a barreira do 3 assume RLS activa.

---

## 11. Plano de reversão

Cada lote reverte-se sozinho, e nenhum depende de restauro de dados.

| Lote | Como reverter | Perde-se |
|---|---|---|
| 1 | `ALTER FUNCTION … SET search_path TO 'public'` nas 46; repor o corpo anterior de `cf_avaliacoes_da_carga` a partir de `20260821_versionar_funcoes_negocio.sql`, que tem paridade MD5 | volta-se ao estado exposto |
| 2 | `ALTER TABLE … DISABLE ROW LEVEL SECURITY` nas 9; `DROP POLICY` nas criadas | volta-se ao estado sem RLS |
| 3 | `DROP POLICY … _bloqueio_*` nas 5 | contas bloqueadas voltam a escrever |
| 4 | conforme a opção | — |

Nenhum dos lotes altera dados. Nenhum apaga objectos existentes: o Lote 1 só
altera `search_path` e um corpo de função; os Lotes 2 e 3 só acrescentam.

**A reversão do Lote 2 tem uma armadilha:** desactivar RLS numa tabela que
entretanto ganhou políticas deixa as políticas lá, inertes — que é exactamente o
estado B que este documento identifica como o pior. Se for preciso reverter,
reverter as duas coisas.

---

## Anexo — o que vigia isto a partir de agora

`npm run test:seguranca-estrutural`, contra uma base reconstruída. Sete regras,
sem listas de excepções, e falha quando não consegue ligar-se — um vigia que não
olhou não pode dizer que está tudo bem.

Depois dos Lotes 2 e 3, falha **uma** regra — a cobertura de barreira de conta
bloqueada, com 16 combinações tabela+comando em 7 tabelas, todas decididas ou
em aberto em §5. As outras seis passam. Fica **fora** da cadeia `npm test`
enquanto essa regra depender de decisões por tomar, para não esconder o resto do
que está verde.

**Uma incoerência que fica em aberto para si decidir:** `test:reconstruction` e
`test:rls` saem com 0 quando não encontram base de dados; este sai com 1. A
regra nova é a certa, mas alinhá-los tornaria `npm test` vermelho em qualquer
máquina sem PostgreSQL. Não os alterei.
