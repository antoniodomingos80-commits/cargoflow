'use client';

import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import { redefinirPassword, type EstadoFormulario } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/logo';
import { ShieldCheck } from 'lucide-react';

const estadoInicial: EstadoFormulario = {};

function BotaoSubmeter() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending}>
      {pending ? 'A guardar…' : 'Guardar nova palavra-passe'}
    </Button>
  );
}

/**
 * Destino da ligação de recuperação.
 *
 * Quando se chega aqui a sessão já existe — foi criada em `/auth/confirmar` ao
 * trocar o código do email. É por isso que não se pede a palavra-passe antiga:
 * quem chega aqui provou ter acesso à caixa de correio da conta.
 */
export default function PaginaRedefinir() {
  const [estado, formAction] = useFormState(redefinirPassword, estadoInicial);

  return (
    <div className="w-full max-w-md animate-fade-up">
      <div className="cf-card p-8">
        <div className="mb-8 text-center">
          <Logo className="justify-center" />
          <h1 className="mt-6 text-2xl font-bold text-navy-600">
            Nova palavra-passe
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Escolha uma que não use noutro sítio
          </p>
        </div>

        <form action={formAction} className="space-y-5">
          {estado.erro && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {estado.erro}
            </div>
          )}

          <Input
            label="Nova palavra-passe"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            hint="Mínimo 8 caracteres, com uma maiúscula e um número."
            error={estado.erros?.password?.[0]}
          />

          <Input
            label="Confirmar palavra-passe"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            error={estado.erros?.confirmPassword?.[0]}
          />

          <BotaoSubmeter />
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Ligação expirada?{' '}
          <Link href="/recuperar" className="font-semibold text-brand-500 hover:underline">
            Pedir outra
          </Link>
        </p>
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        Ligação segura e encriptada
      </p>
    </div>
  );
}
