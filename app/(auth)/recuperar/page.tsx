'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { pedirRecuperacao, type EstadoFormulario } from '../actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/logo';
import { ArrowLeft, MailCheck, ShieldCheck } from 'lucide-react';

const estadoInicial: EstadoFormulario = {};

function BotaoSubmeter() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block loading={pending}>
      {pending ? 'A enviar…' : 'Enviar ligação de recuperação'}
    </Button>
  );
}

export default function PaginaRecuperar() {
  const [estado, formAction] = useActionState(pedirRecuperacao, estadoInicial);

  return (
    <div className="w-full max-w-md animate-fade-up">
      <div className="cf-card p-8">
        <div className="mb-8 text-center">
          <Logo className="justify-center" />
          <h1 className="mt-6 text-2xl font-bold text-navy-600">
            Recuperar acesso
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Enviamos-lhe uma ligação para definir uma nova palavra-passe
          </p>
        </div>

        {estado.sucesso ? (
          <div className="rounded-lg border border-green-200 bg-green-50/60 p-5 text-center">
            <MailCheck className="mx-auto h-8 w-8 text-green-500" aria-hidden="true" />
            <p className="mt-3 font-semibold text-navy-600">Verifique o seu email</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Se existir uma conta com esse endereço, a ligação chega dentro de
              alguns minutos. É válida durante uma hora e só pode ser usada uma vez.
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Não recebeu? Veja a pasta de spam antes de pedir outra.
            </p>
          </div>
        ) : (
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
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="nome@empresa.co.ao"
              error={estado.erros?.email?.[0]}
            />

            <BotaoSubmeter />
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link
            href="/entrar"
            className="inline-flex items-center gap-1.5 font-medium text-slate-600 hover:text-navy-600"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar a entrar
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
