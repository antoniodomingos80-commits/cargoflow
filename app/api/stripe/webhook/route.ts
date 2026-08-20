import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { atualizarPagamentoInterno } from '@/lib/pagamentos/reconciliacao';

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook não configurado.' }, { status: 500 });
  }

  const stripe = new Stripe(secretKey);
  const body = await request.text();
  const signature = (await headers()).get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Assinatura Stripe em falta.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Webhook inválido.' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    await atualizarPagamentoInterno({
      provider: 'STRIPE',
      paymentId: session.metadata?.payment_id || null,
      externalId: session.id,
      status: 'PAID',
      rawPayload: session as unknown as Record<string, unknown>,
    });
  }

  if (event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    await atualizarPagamentoInterno({
      provider: 'STRIPE',
      paymentId: session.metadata?.payment_id || null,
      externalId: session.id,
      status: 'PAID',
      rawPayload: session as unknown as Record<string, unknown>,
    });
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    const session = event.data.object as Stripe.Checkout.Session;
    await atualizarPagamentoInterno({
      provider: 'STRIPE',
      paymentId: session.metadata?.payment_id || null,
      externalId: session.id,
      status: 'FAILED',
      rawPayload: session as unknown as Record<string, unknown>,
    });
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    await atualizarPagamentoInterno({
      provider: 'STRIPE',
      paymentId: session.metadata?.payment_id || null,
      externalId: session.id,
      status: 'EXPIRED',
      rawPayload: session as unknown as Record<string, unknown>,
    });
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object as Stripe.PaymentIntent;
    await atualizarPagamentoInterno({
      provider: 'STRIPE',
      paymentId: intent.metadata?.payment_id || null,
      externalId: intent.id,
      status: 'FAILED',
      rawPayload: intent as unknown as Record<string, unknown>,
    });
  }

  return NextResponse.json({ received: true });
}