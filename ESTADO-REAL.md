# Estado real da plataforma

**Data do levantamento:** 19 de Agosto de 2026
**Verificado contra:** produção (`cargoflow-theta.vercel.app`), repositório em `main` e base de dados Supabase `wneehgoeqipgdpprphdc`.

Este documento existe porque a documentação do projecto passou a contradizer-se e, em vários pontos, a realidade. Nada aqui vem de relatórios anteriores: cada linha foi verificada no código, no schema ou na contagem de linhas das tabelas. Quando um documento antigo disser o contrário deste, é este que vale.

---

## Como ler os estados

| Estado | Significa |
|---|---|
| **Em uso** | Está em produção e há dados reais de utilizadores a passar por lá. |
| **Em produção, por estrear** | O código está publicado e funciona, mas ninguém o exerceu ainda — a tabela está vazia. |
| **Código pronto, inactivo** | Está escrito e compila, mas falta configuração ou credenciais externas para ligar. |
| **Não existe** | Está descrito em documentação, mas não há código nem tabelas. |

---

## Quadro por módulo

| # | Módulo | Estado | Evidência |
|---|---|---|---|
| 1 | Autenticação e 5 perfis | **Em uso** | 23 contas: 12 comerciantes, 7 camionistas, 3 empresas, 1 admin |
| 2 | Multi-tenant + RLS | **Em uso** | 31 tabelas com RLS activo; funções `is_platform_admin`, `current_tenant_id`, `current_user_id` |
| 3 | Marketplace de cargas | **Em uso** | 17 cargas |
| 4 | Marketplace de viagens | **Em uso** | 13 viagens |
| 5 | Motor de correspondência | **Em uso** | 4 correspondências geradas; `lib/matching/actions.ts` |
| 6 | Propostas e acordos | **Em uso** | 12 propostas, 5 acordos |
| 7 | Mensagens | **Em uso** | 9 conversas, 15 mensagens |
| 8 | Documentos | **Em uso** | 23 documentos, buckets privados |
| 9 | Notificações in-app | **Em uso** | 62 notificações |
| 10 | Frota | **Em uso** | 9 veículos |
| 11 | Automatismos de base de dados | **Em uso** | 2 tarefas `pg_cron` activas: partições futuras (mensal) e expiração de anúncios (horária) |
| 12 | Rastreamento GPS | **Em produção, por estrear** | 5 eventos de tracking; `tracking_points_*` com **0 posições** em todas as partições. Inclui fila offline (ver 23) |
| 13 | Prova de entrega (POD) | **Em produção, por estrear** | `proof_of_delivery` com **0 linhas** |
| 14 | Avaliações e reputação | **Em produção, por estrear** | `reviews` com **0 linhas** |
| 15 | Motoristas | **Em produção, por estrear** | `drivers` com **0 linhas** |
| 16 | Trust Layer | **Em uso desde 19/08** | 4 tabelas, 13 requisitos de verificação, bloqueio de contas e auditoria ligados |
| 17 | Administração | **Em uso** | 7 páginas, com barreira de perfil no layout do segmento |
| 18 | Pagamentos (Stripe + Multicaixa) | **Código pronto, inactivo** | `lib/pagamentos/actions.ts` (393 linhas), webhooks em `/api/stripe/webhook` e `/api/multicaixa/callback`; `payments` com **0 linhas** |
| 19 | Carteira | **Código pronto, quase por estrear** | 1 movimento em `wallet_transactions` |
| 20 | WhatsApp | **Código pronto, inactivo** | Twilio em `lib/whatsapp/actions.ts`; sem `TWILIO_ACCOUNT_SID` configurado a função sai em silêncio; número por defeito é o *sandbox* |
| 21 | Notificações por email | **Não existe** | Zero referências a Resend, SendGrid ou qualquer serviço de email no código |
| 22 | Notificações push / FCM | **Não existe** | Sem service worker nem registo de push |
| 23 | Fila GPS offline | **Em produção, por estrear** | `lib/rastreio/fila-offline.ts`: IndexedDB + reenvio automático ao recuperar rede. Nunca exercida (0 posições registadas) |
| 23b | PWA (app a abrir sem rede) | **Não existe** | Só `public/manifest.json`; não há service worker, logo a aplicação não carrega offline |
| 24 | MFA / autenticação multifator | **Não existe** | Zero referências a MFA no código |
| 25 | Camada de IA (matching preditivo, dynamic pricing, detecção de anomalias) | **Não existe** | Nenhuma tabela, nenhum módulo no repositório |

---

## Bloqueador único e real

**Falta de NIF / entidade legal registada.** É o que impede abrir conta Stripe e obter entidade Multicaixa. O código de pagamentos está escrito e testável — o que falta não é engenharia. Enquanto isto não estiver resolvido, os módulos 18 e 19 ficam onde estão.

Tudo o resto que está por fazer depende só de decisão e tempo.

---

## O que a documentação diz que não se confirma

### 1. `01-DOSSIER-INVESTIDORES.md` — subestima gravemente

A secção "Estado atual" diz que existem "protótipos de alta fidelidade" e que falta "capital para a construção do núcleo". Isso era verdade quando foi escrito e deixou de ser: o núcleo está construído e em produção, com utilizadores e dados reais. **É o documento que vai a investidores e está a vender menos do que existe.** Deve ser o primeiro a corrigir.

### 2. `PAGAMENTOS-ROLLOUT.md` — verdadeiro sobre o código, silencioso sobre o bloqueio

Diz que o módulo está "já implementado no código", o que é exacto. Mas não diz que não há entidade legal para obter as credenciais, e por isso alguém pode ler o documento como se bastasse colar chaves de API. Falta um aviso no topo.

### 3. `README.md` — contradiz-se a si próprio

As linhas 5–11 dão as semanas 5 a 12 como concluídas; as linhas 249–256 listam essas mesmas semanas em "Próximos passos". Uma das duas secções tem de sair.

### 4. `02-ARQUITETURA-TECNICA.md` — descreve como existente o que é plano

MFA obrigatório, Web Push, FCM, Resend, SMS: nada disto existe no código. A capacidade offline existe **em parte** — a fila de posições GPS em IndexedDB está implementada e sincroniza sozinha ao recuperar rede; o que não existe é service worker (a aplicação não abre sem rede) nem fila para publicar cargas offline, que o `03-MVP-E-ROADMAP.md` promete. O documento é legítimo como arquitectura-alvo, mas tem de dizer que é alvo. Refere também Next.js 14 quando a aplicação corre em **Next.js 16.3**.

### 5. `05-TESTE-EM-PRODUCAO.md` — desactualizado

Afirma que "nunca foi gerada nenhuma correspondência com dados reais". Já foram geradas 4.

### 6. Relatórios de auditoria e de fase (fora do repositório)

Os documentos de Fase 3, Sprint 0 e auditoria pré-produção declaram sistemas "100% implementados" cujas tabelas **não existem na base de dados**: sistema de propostas com 7 tabelas, perfis Trust (`transporter_profiles`, `shipper_profiles`, `fleet_vehicles`, `reputation_aggregate`), tracking (`cargo_tracking`, `cargo_waypoints`, `cargo_incidents`), notificações com 8 tabelas, camada de IA com 13 tabelas Prisma. A aplicação real corre sobre um schema diferente e mais simples — o de `04-MODELO-DE-DADOS.sql`, mais as migrações de pagamentos e Trust Layer.

Esses ficheiros são **desenho e referência**, não inventário do que está construído. Devem ser marcados como tal.

### 7. "42 testes, 100% de aprovação"

A suite automatizada é um ficheiro, `tests/qa.test.ts`, com **5 testes** Playwright de fumo (landing, registo, protecção de rota, login, 404). Não há sequer um script `test` no `package.json` para os correr. A alegação de 42 testes não tem suporte no repositório.

---

## Higiene do repositório

Onze ficheiros foram commitados por engano na raiz e são cópias duplicadas de módulos que já vivem no sítio certo:

```
actions.ts  guard.ts  utilizadores.ts  verificacoes.ts  verificacoes_1.ts
page.tsx  AuditLog.tsx  BlocklistManager.tsx  VerificationRequirements.tsx
ProposalForm.tsx (0 bytes)  20260819_trust_requirements_seed.sql
```

Devem ser apagados. Nenhum é carregado pela aplicação — o Next.js só lê `app/`, `components/` e `lib/` — mas duplicam código que vai divergir e confundem quem (ou o que) ler o repositório.

---

## O que fazer a seguir, por ordem

1. **Apagar os 11 ficheiros soltos da raiz.** Cinco minutos — é o único item desta lista ainda por fazer no repositório.
2. ~~Corrigir o `01-DOSSIER-INVESTIDORES.md`~~ — feito a 19/08, secção 8 reescrita com o estado verificado.
3. **Levar uma carga real do anúncio ao POD e à avaliação.** Os módulos 12 a 15 nunca foram exercidos — é aí que estão os bugs que nenhuma auditoria em papel apanha.
4. **Resolver o registo da empresa.** Desbloqueia os pagamentos, que é a única coisa entre a plataforma e ter receita.
5. **Marcar os documentos de fase como desenho.** Um cabeçalho em cada um chega.
