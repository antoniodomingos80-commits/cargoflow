'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  atualizarPerfil,
  atualizarEmpresa,
  type EstadoConfiguracoes,
} from '@/lib/configuracoes/actions';

const estadoInicial: EstadoConfiguracoes = {};

function BotaoGuardar({ texto = 'Guardar alterações' }: { texto?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? 'A guardar...' : texto}
    </Button>
  );
}

type Props = {
  perfil: {
    fullName: string;
    email: string;
    phone: string;
  };
  empresa: {
    name: string;
    taxId: string;
    defaultCurrency: string;
  };
  podeEditarEmpresa: boolean;
};

export function FormularioConfiguracoes({ perfil, empresa, podeEditarEmpresa }: Props) {
  const [estadoPerfil, formPerfil] = useActionState(atualizarPerfil, estadoInicial);
  const [estadoEmpresa, formEmpresa] = useActionState(atualizarEmpresa, estadoInicial);

  return (
    <div className="space-y-6">
      <section className="cf-card p-6">
        <h2 className="text-lg font-semibold text-navy-600">Perfil</h2>
        <p className="mt-1 text-sm text-slate-500">Dados pessoais visíveis na plataforma.</p>

        <form action={formPerfil} className="mt-5 space-y-4">
          {estadoPerfil.erro && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {estadoPerfil.erro}
            </p>
          )}
          {estadoPerfil.sucesso && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {estadoPerfil.sucesso}
            </p>
          )}

          <Input
            label="Nome completo"
            name="fullName"
            required
            defaultValue={perfil.fullName}
            error={estadoPerfil.erros?.fullName?.[0]}
          />

          <Input label="Email" name="email" disabled defaultValue={perfil.email} />

          <Input
            label="Telefone"
            name="phone"
            defaultValue={perfil.phone}
            placeholder="+244923456789"
            hint="Opcional. Formato: +244923456789"
            error={estadoPerfil.erros?.phone?.[0]}
          />

          <BotaoGuardar texto="Guardar perfil" />
        </form>
      </section>

      <section className="cf-card p-6">
        <h2 className="text-lg font-semibold text-navy-600">Empresa</h2>
        <p className="mt-1 text-sm text-slate-500">
          Informações da sua organização e moeda padrão de negociação.
        </p>

        {!podeEditarEmpresa ? (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Só administradores da empresa podem editar estes campos.
          </p>
        ) : (
          <form action={formEmpresa} className="mt-5 space-y-4">
            {estadoEmpresa.erro && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {estadoEmpresa.erro}
              </p>
            )}
            {estadoEmpresa.sucesso && (
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                {estadoEmpresa.sucesso}
              </p>
            )}

            <Input
              label="Nome da empresa"
              name="name"
              required
              defaultValue={empresa.name}
              error={estadoEmpresa.erros?.name?.[0]}
            />

            <Input
              label="NIF"
              name="taxId"
              defaultValue={empresa.taxId}
              error={estadoEmpresa.erros?.taxId?.[0]}
            />

            <Select
              label="Moeda padrão"
              name="defaultCurrency"
              defaultValue={empresa.defaultCurrency || 'AOA'}
              error={estadoEmpresa.erros?.defaultCurrency?.[0]}
            >
              <option value="AOA">AOA · Kwanza</option>
              <option value="USD">USD · Dólar</option>
              <option value="EUR">EUR · Euro</option>
              <option value="ZAR">ZAR · Rand</option>
            </Select>

            <BotaoGuardar texto="Guardar empresa" />
          </form>
        )}
      </section>
    </div>
  );
}