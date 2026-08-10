# Pagamentos — Rollout em Produção

Este guia ativa o módulo completo de pagamentos (Stripe + Multicaixa) já implementado no código.

## 1) Aplicar migração no Supabase

No Supabase SQL Editor, executar o ficheiro:

- `supabase/migrations/20260810_payments_phase2.sql`

Isto cria:
- tabela `payments`
- enums `payment_provider` e `payment_status`
- índices, trigger `updated_at`
- políticas RLS

## 2) Configurar variáveis no Vercel

Em **Project > Settings > Environment Variables**:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `MULTICAIXA_ENTITY` (ex.: `11333`)
- `MULTICAIXA_CALLBACK_SECRET` (segredo forte)

Já existentes (confirmar):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

## 3) Configurar webhook Stripe

No Stripe Dashboard:
1. Criar endpoint webhook para:
   - `https://SEU-DOMINIO/api/stripe/webhook`
2. Subscrever eventos:
   - `checkout.session.completed`
   - `checkout.session.expired`
   - `payment_intent.payment_failed`
3. Copiar secret de assinatura para `STRIPE_WEBHOOK_SECRET`.

## 4) Integrar callback Multicaixa

Configurar o provedor/ponte de pagamentos para chamar:

- `POST https://SEU-DOMINIO/api/multicaixa/callback`
- Header obrigatório: `x-callback-secret: <MULTICAIXA_CALLBACK_SECRET>`

Payload esperado (exemplo):

```json
{
  "referencia": "123456789",
  "estado": "PAID",
  "transacaoId": "mcx_tx_001"
}
```

Estados aceites (`estado`):
- `PAID | PAGO | SUCCESS | SUCESSO`
- `FAILED | FALHOU | ERRO`
- `CANCELLED | CANCELADO`
- `EXPIRED | EXPIRADO`

## 5) Smoke test funcional

1. Entrar com conta que tenha acordos fechados.
2. Ir a `/pagamentos`.
3. Gerar referência Multicaixa.
4. Confirmar que aparece no histórico com estado `PENDING`.
5. Simular callback para `PAID` e confirmar atualização do estado no histórico.
6. Iniciar checkout Stripe e concluir pagamento de teste.
7. Confirmar atualização para `PAID` após webhook.

## 6) Testes manuais via terminal (local)

### 6.1 Multicaixa callback

```powershell
curl -X POST "http://localhost:3000/api/multicaixa/callback" ^
  -H "Content-Type: application/json" ^
  -H "x-callback-secret: SEU_SEGREDO" ^
  -d "{\"referencia\":\"123456789\",\"estado\":\"PAID\",\"transacaoId\":\"mcx_teste_1\"}"
```

### 6.2 Stripe webhook local (Stripe CLI)

```powershell
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Depois executar checkout de teste no UI para disparar eventos.

## 7) Observabilidade recomendada

- Monitorizar erros 4xx/5xx nos endpoints:
  - `/api/stripe/webhook`
  - `/api/multicaixa/callback`
- Criar alerta para pagamentos `PENDING` com `expires_at` ultrapassado.
- Rever diariamente pagamentos `FAILED` para reconciliação manual.

## 8) Limitações atuais (esperadas)

- Ainda não existe ledger/carteira/escrow completo.
- O estado é persistido em `payments`; reconciliação financeira detalhada entra na próxima iteração.
