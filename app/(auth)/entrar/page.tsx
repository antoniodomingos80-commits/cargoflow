'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { entrar, type EstadoFormulario } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/logo';
import { ShieldCheck } from 'lucide-react';

const estadoInicial: EstadoFormulario = {};

function BotaoSubmeter() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending}>
      {pending ? 'A entrar…' : 'Entrar'}
    </Button>
  );
}

function Formulario() {
  const [estado, formAction] = useActionState(entrar, estadoInicial);
  const params = useSearchParams();
  const destino = params.get('destino') ?? '/painel';

  // Erro trazido de uma ligação de email que falhou. Mostrá-lo evita o caso
  // em que a pessoa clica no email, aterra no login e não percebe porquê.
  const erroDaLigacao = params.get('erro');

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="destino" value={destino} />

      {(estado.erro || erroDaLigacao) && (
        <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {estado.erro ?? erroDaLigacao}
        </div>
      )}

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="nome@empresa.co.ao"
        error={estado.erros?.email?.[0]}
      />

      <div className="space-y-1.5">
        <Input
          label="Palavra-passe"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={estado.erros?.password?.[0]}
        />
        <div className="text-right">
          <Link href="/recuperar" className="text-xs font-medium text-brand-500 hover:underline">
            Esqueceu a palavra-passe?
          </Link>
        </div>
      </div>

      <BotaoSubmeter />
    </form>
  );
}

export default function PaginaEntrar() {
  return (
    <div className="w-full max-w-md animate-fade-up">
      <div className="cf-card p-8">
        <div className="mb-8 text-center">
          <Logo className="justify-center" />
          <h1 className="mt-6 text-2xl font-bold text-navy-600">Bem-vindo de volta</h1>
          <p className="mt-1 text-sm text-slate-500">Aceda à sua conta para continuar</p>
        </div>

        <Suspense fallback={<div className="cf-skeleton h-64" />}>
          <Formulario />
        </Suspense>

        <p className="mt-6 text-center text-sm text-slate-600">
          Novo na CargoFlow?{' '}
          <Link href="/registo" className="font-semibold text-brand-500 hover:underline">
            Criar conta
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
