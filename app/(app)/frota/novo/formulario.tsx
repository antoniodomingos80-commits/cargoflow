'use client';

import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { criarVeiculo, type EstadoVeiculo } from '@/lib/frota/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { VEHICLE_TYPE_LABELS } from '@/lib/types';
import { AlertCircle } from 'lucide-react';

const estadoInicial: EstadoVeiculo = {};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      Registar veículo
    </Button>
  );
}

export function FormularioVeiculo() {
  const [estado, formAction] = useFormState(criarVeiculo, estadoInicial);

  return (
    <form action={formAction} className="space-y-6">
      {estado.erro && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{estado.erro}</span>
        </div>
      )}

      <section className="cf-card space-y-4 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Matrícula"
            name="plate"
            required
            placeholder="LD-45-78-AB"
            className="font-mono uppercase"
            error={estado.erros?.plate?.[0]}
          />
          <Select
            label="Tipo de veículo"
            name="type"
            required
            placeholder="Selecionar…"
            error={estado.erros?.type?.[0]}
          >
            {Object.entries(VEHICLE_TYPE_LABELS).map(([v, rotulo]) => (
              <option key={v} value={v}>{rotulo}</option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Marca" name="brand" placeholder="Volvo" error={estado.erros?.brand?.[0]} />
          <Input label="Modelo" name="model" placeholder="FH 540" error={estado.erros?.model?.[0]} />
          <Input
            label="Ano"
            name="year"
            type="number"
            min={1970}
            max={new Date().getFullYear() + 1}
            placeholder="2020"
            error={estado.erros?.year?.[0]}
          />
        </div>
      </section>

      <section className="cf-card space-y-4 p-6">
        <h2 className="font-semibold text-navy-600">Capacidade</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Carga máxima (kg)"
            name="maxWeightKg"
            type="number"
            min={1}
            max={60000}
            step={100}
            required
            placeholder="8000"
            error={estado.erros?.maxWeightKg?.[0]}
          />
          <Input
            label="Volume (m³)"
            name="maxVolumeM3"
            type="number"
            min={0}
            step="0.5"
            placeholder="Opcional"
            hint="Ajuda a encontrar cargas volumosas mas leves."
            error={estado.erros?.maxVolumeM3?.[0]}
          />
        </div>

        <div className="space-y-3 pt-2">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="hasRefrigeration"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-navy-600">
                Tem sistema de refrigeração
              </span>
              <span className="block text-xs text-slate-500">
                Permite receber cargas perecíveis e refrigeradas.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="hasTailLift"
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
            />
            <span>
              <span className="block text-sm font-medium text-navy-600">
                Tem plataforma elevatória
              </span>
              <span className="block text-xs text-slate-500">
                Facilita carga e descarga sem empilhador.
              </span>
            </span>
          </label>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <Link href="/frota" className="text-sm text-slate-500 hover:text-navy-600">
          Cancelar
        </Link>
        <Botao />
      </div>
    </form>
  );
}
