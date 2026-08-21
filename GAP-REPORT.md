# CargoFlow — Implementation Gap Report

**Auditoria de 19 de Agosto de 2026** · Fase 1 e 2 concluídas · implementação ainda não iniciada

**Produção:** `cargoflow-theta.vercel.app` · deployment `dpl_EpKyMQKBgBimdt2VAv9wkSgduAx8` · commit `6020e33` · branch `main` · estado READY
**Repositório auditado:** clone de `origin/main` em `6020e33` — sincronizado com a produção, sem diferenças
**Base de dados:** Supabase `wneehgoeqipgdpprphdc` · 32 tabelas · RLS activo em 31

> Nota sobre o caminho indicado no pedido: `/home/claude/cargoflow-work` não existe nesta sessão. A auditoria foi feita sobre o `main` do GitHub, que é exactamente o código que está em produção.

---

## Critério aplicado

Uma funcionalidade só é ✅ quando existe **base de dados + backend + autorização + RLS + UI + fluxo de utilizador**. Tabela criada, migração aplicada, função escrita ou componente não usado contam como código morto, não como implementação.

---

## FASE 2 — Cruzamento com o Sprint 1 Database Foundation

Todas as estruturas do Sprint 1 **existem na base de dados**. Nenhuma delas foi recriada nem duplicada. O problema é outro:

| Estrutura | Existe na BD | Consumida pelo código | Dados reais |
|---|---|---|---|
| `user_blocklist` | ✅ | 🟡 só pelo painel admin | 0 linhas |
| `verification_requirements` | ✅ | 🟡 só leitura no painel admin | 13 linhas (seed de hoje) |
| `verification_audit_log` | ✅ | 🟡 só escrito por bloqueios | 0 linhas |
| `users.trust_score` | ✅ numeric | 🔴 **zero referências no código** | 24/24 contas a 50.00 — o valor por omissão, nunca calculado |
| `users.is_blocked` | ✅ boolean | 🔴 **zero referências no código** | 0 true |
| `users.blocked_at` / `blocked_reason` | ✅ | 🔴 zero referências | vazio |
| `users.verification_date` / `verified_by` | ✅ | 🔴 zero referências — `decidirVerificacao` não os escreve | 0 preenchidos |
| `documents.for_verification` | ✅ boolean | 🔴 zero referências | 0 de 23 documentos |
| `drivers.background_check_date` / `_valid_until` | ✅ | 🔴 zero referências | tabela vazia (0 motoristas) |
| `vehicles.insurance_valid_until` | ✅ | 🔴 zero referências | 0 de 9 veículos |
| `vehicles.inspection_valid_until` / `inspection_number` / `registration_number` | ✅ | 🔴 zero referências | 0 de 9 veículos |

**Conclusão da Fase 2:** o Sprint 1 aplicou o esquema e mais nada. É uma fundação inteiramente inerte — nenhuma linha de código lê ou escreve qualquer uma das colunas novas.

---

## Achado crítico — três mecanismos de bloqueio que não se falam, e nenhum tem efeito

Existem hoje **três** formas de bloquear uma conta:

1. `users.banned` + `ban_reason` — escrito por `lib/admin/utilizadores.ts` (`suspenderUtilizador` / `ativarUtilizador`), visível em `/admin/utilizadores`
2. `users.is_blocked` + `blocked_at` + `blocked_reason` — criado pelo Sprint 1, **nunca escrito nem lido**
3. `user_blocklist` — escrito pelo `BlocklistManager` em `/admin/trust`

**Nenhuma operação de negócio verifica qualquer um dos três.** Confirmado por pesquisa exaustiva em `app/`, `lib/` e `components/`: `is_blocked` e `trust_score` têm zero ocorrências; `banned` só aparece no painel de administração; `user_blocklist` só no painel Trust.

Consequência concreta: **um utilizador bloqueado continua a publicar cargas, a enviar propostas, a criar viagens e a iniciar pagamentos**, desde que a sua verificação esteja aprovada. O bloqueio é decorativo.

Este é o gap com maior consequência de todo o relatório.

---

## O que já funciona a sério — o gate de verificação

Ao contrário do bloqueio, a barreira de verificação **está integrada e funciona**. `perfil.user.verification !== 'APPROVED'` trava, no servidor:

| Operação | Ficheiro | Linha |
|---|---|---|
| Criar carga com publicação | `lib/cargas/actions.ts` | 107 |
| Editar carga para publicar | `lib/cargas/actions.ts` | 205 |
| Publicar carga | `lib/cargas/actions.ts` | 261 |
| Enviar proposta a carga | `lib/propostas/actions.ts` | 39 |
| Enviar proposta a viagem | `lib/propostas/actions.ts` | 145 |
| Contrapropor | `lib/propostas/actions.ts` | 308 |
| Criar viagem | `lib/viagens/actions.ts` | 51 |
| Pagamentos (4 pontos) | `lib/pagamentos/actions.ts` | 83, 95, 192, 266 |

Isto é integração real: base de dados → server action → bloqueio → UI. É a prova de que o padrão certo já existe no projecto; falta aplicá-lo ao bloqueio e ao trust score.

---

## FASE 1 — Classificação por área

| # | Área | Estado | Evidência |
|---|---|---|---|
| 1 | Estrutura do projecto | ✅ | Next.js 16.3 App Router, 36 rotas, `proxy.ts` como middleware |
| 2 | App Router / rotas | ✅ | 36 páginas + 3 API routes, todas geradas no build |
| 3 | Pages | ✅ | Todas montadas e alcançáveis |
| 4 | Components | 🟡 | `components/trust/*` só usados no painel admin; nenhum componente Trust no lado do utilizador |
| 5 | Server Actions | ✅ | ~80 acções em 20 módulos `lib/*` |
| 6 | API routes | 🟡 | 3 rotas (`stripe/webhook`, `multicaixa/callback`, `faturas/[paymentId]`); as duas primeiras nunca foram exercidas |
| 7 | Supabase | ✅ | Cliente de sessão + cliente admin, `getSessionProfile` centralizado |
| 8 | Migrations | ✅ | 6 migrações, incluindo as duas do Sprint 1, todas aplicadas |
| 9 | RLS | ✅ | 31 de 32 tabelas com RLS; `spatial_ref_sys` é tabela de sistema PostGIS |
| 10 | Authentication | ✅ | Supabase Auth + `proxy.ts` protege rotas privadas; verificado em produção (`/admin/trust` → `/entrar?destino=…`) |
| 11 | Marketplace | ✅ | `/mercado/cargas` e `/mercado/viagens` com filtros; 17 cargas, 13 viagens |
| 12 | Loads | ✅ | Ciclo completo: criar, editar, publicar, cancelar, expirar por `pg_cron` |
| 13 | Matching | ✅ | `lib/matching/actions.ts`, regras determinísticas, 4 correspondências reais, notifica por WhatsApp e in-app |
| 14 | Offers | ✅ | 12 propostas, 5 acordos; enviar, contrapropor, aceitar, rejeitar, retirar |
| 15 | Trips | ✅ | 13 viagens; criar, editar, cancelar |
| 16 | Documents | 🟡 | Upload, listagem e remoção funcionam (23 documentos, buckets privados). **Não valida contra `verification_requirements`** e nunca escreve `for_verification` |
| 17 | Verification | 🟡 | Fluxo admin funciona, mas `decidirVerificacao` aprova o utilizador, o tenant **e todos os documentos do tenant em bloco**; não escreve `verification_date`, `verified_by` nem auditoria |
| 18 | Trust | ⚠️ **Implementado mas não integrado** | Painel admin completo desde hoje; `trust_score` nunca calculado; requisitos invisíveis ao utilizador; bloqueio sem efeito |
| 19 | Payments | ⚠️ **Implementado mas não disponível** | `lib/pagamentos/actions.ts` com Stripe checkout e referência Multicaixa; `payments` com 0 linhas |
| 20 | Multicaixa | ⚠️ **Implementado mas não activado** | Callback em `/api/multicaixa/callback` com validação de `x-callback-secret`; falta `MULTICAIXA_ENTITY`. **O NIF já existe — deixou de ser bloqueador legal** |
| 21 | Notifications | 🟡 | In-app funciona (62 notificações), mas só o matching as gera. Sem email, sem push |
| 22 | Admin | ✅ | 7 páginas, barreira de perfil no layout do segmento (`6020e33`), acções com `exigirPlatformAdmin` |
| 23 | Tracking | 🟡 | Código completo incl. fila offline em IndexedDB; **0 posições GPS registadas** — nunca exercido |
| 24 | Proof of Delivery | 🟡 | `registarEntrega`, `confirmarRececao`, fotos, assinatura; **0 linhas** em `proof_of_delivery` |
| 25 | Reviews | 🟡 | `avaliar()` existe e escreve em `reviews`; **0 avaliações** |
| 26 | Analytics | 🟡 | `indicadoresPlataforma` e `operacoesPlataforma` alimentam `/admin/relatorios` e `/relatorios`. Sem módulo dedicado, sem séries temporais |

---

## Gaps confirmados, por prioridade

### P0 — Segurança e integridade

**G1. Bloqueio sem efeito.** Nenhuma operação verifica `banned`, `is_blocked` ou `user_blocklist`.
*Correcção:* uma barreira única e partilhada, aplicada nas mesmas acções que já verificam a verificação.

**G2. Três mecanismos de bloqueio divergentes.** Bloquear em `/admin/trust` não suspende em `/admin/utilizadores` e vice-versa.
*Correcção:* eleger `user_blocklist` como fonte de verdade e reflectir em `users.is_blocked`; manter `banned` sincronizado enquanto a UI antiga existir.

**G3. `decidirVerificacao` aprova todos os documentos do tenant em bloco.** Um documento inválido é aprovado junto com os válidos.
*Correcção:* decidir documento a documento, ou pelo menos registar quais foram abrangidos.

### P1 — Trust Layer por fechar

**G4. `trust_score` nunca é calculado.** 24 contas a 50.00.
*Correcção:* `lib/trust/score.ts` centralizado, recalculado nos eventos que mudam as entradas.

**G5. O utilizador não vê nada do Trust Layer.** Não sabe que documentos precisa, nem o seu score, nem porque foi rejeitado.
*Correcção:* área de confiança do utilizador alimentada por `verification_requirements`.

**G6. `verification_requirements` não valida nada.** O upload aceita qualquer tipo de documento.
*Correcção:* validar tipo contra os requisitos do perfil; marcar `for_verification`.

**G7. Auditoria incompleta.** Aprovações e rejeições de verificação não entram no `verification_audit_log`.

**G8. Colunas de compliance vazias.** `insurance_valid_until`, `inspection_valid_until`, `background_check_*` não têm interface de preenchimento.

### P2 — Cobertura e operação

**G9. Fluxo operacional nunca exercido.** Tracking, POD, avaliações e motoristas: 0 linhas.

**G10. Pagamentos por activar.** Com o NIF resolvido, falta configurar as variáveis de ambiente e ligar os webhooks.

**G11. Notificações limitadas.** Só o matching notifica; sem email nem push.

**G12. Testes.** 5 testes Playwright de fumo; sem script `test` no `package.json`.

---

## O que NÃO vou fazer

- Não recriar `user_blocklist`, `verification_requirements` nem `verification_audit_log` — existem e estão correctas.
- Não criar `user_documents`, `vehicle_documents` nem `trust_profiles` — `documents`, `vehicles` e `users` já suportam tudo o que é preciso.
- Não reimplementar marketplace, cargas, matching, propostas ou viagens — estão funcionais com dados reais.
- Não tocar no gate de verificação existente, que funciona.

---

## Produção vs local

Sem divergência. `origin/main` = `6020e33` = commit do deployment de produção READY. O ciclo GitHub → Vercel está a funcionar; o atraso anterior foi causado por um build partido a 17/08 seguido de um redeploy de um commit antigo, ambos já resolvidos.
