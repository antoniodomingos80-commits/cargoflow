'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import Link from 'next/link';
import { criarCarga, editarCarga, type EstadoCarga } from '@/lib/cargas/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CARGO_TYPE_LABELS, VEHICLE_TYPE_LABELS, type CFLocation } from '@/lib/types';
import { AlertCircle, Zap } from 'lucide-react';

const estadoInicial: EstadoCarga = {};

/** Valores atuais quando se está a editar em vez de criar */
export interface CargaEditavel {
  id: string;
  title: string;
  description: string | null;
  origin_id: string;
  destination_id: string;
  cargo_type: string;
  weight_kg: number | string;
  volume_m3: number | string | null;
  required_vehicle_type: string | null;
  pickup_from: string;
  pickup_until: string;
  delivery_deadline: string | null;
  is_urgent: boolean;
  budget_amount: number | string | null;
  status: string;
}

/** ISO → valor aceite por <input type="datetime-local"> na hora local */
function paraCampoDataHora(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  const desvio = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - desvio).toISOString().slice(0, 16);
}

function Botoes({
  verificado,
  edicao,
  ehRascunho,
}: {
  verificado: boolean;
  edicao: boolean;
  ehRascunho: boolean;
}) {
  const { pending } = useFormStatus();

  // Numa carga já publicada não faz sentido "guardar rascunho" — despublicá-la
  // apanharia de surpresa quem estivesse a preparar uma proposta.
  const mostrarRascunho = !edicao || ehRascunho;

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      {mostrarRascunho && (
        <Button
          type="submit"
          name="accao"
          value="rascunho"
          variant="outline"
          loading={pending}
        >
          {edicao ? 'Guardar como rascunho' : 'Guardar rascunho'}
        </Button>
      )}
      <Button
        type="submit"
        name="accao"
        value="publicar"
        loading={pending}
        disabled={!verificado && (!edicao || ehRascunho)}
        title={verificado ? undefined : 'É necessário ter a conta verificada'}
      >
        {edicao
          ? ehRascunho
            ? 'Guardar e publicar'
            : 'Guardar alterações'
          : 'Publicar carga'}
      </Button>
    </div>
  );
}

export function FormularioCarga({
  localidades,
  verificado,
  carga,
}: {
  localidades: CFLocation[];
  verificado: boolean;
  /** Presente apenas em modo de edição */
  carga?: CargaEditavel;
}) {
  const edicao = !!carga;
  const ehRascunho = carga?.status === 'DRAFT';
  const [estado, formAction] = useFormState(
    edicao ? editarCarga : criarCarga,
    estadoInicial,
  );
  const [tipoCarga, setTipoCarga] = useState(carga?.cargo_type ?? 'GENERAL');

  // Data mínima: hoje. Evita publicar cargas com recolha no passado.
  const hoje = new Date().toISOString().slice(0, 16);

  return (
    <form action={formAction} className="space-y-6">
      {edicao && <input type="hidden" name="cargaId" value={carga!.id} />}

      {estado.erro && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{estado.erro}</span>
        </div>
      )}

      {!verificado && (!edicao || ehRascunho) && (
        <div className="rounded-lg bg-accent-50 px-4 py-3 text-sm text-accent-800">
          A sua conta ainda não está verificada. Pode preparar a carga e guardar
          como rascunho — publica assim que os documentos forem aprovados.
        </div>
      )}

      {edicao && !ehRascunho && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          Ao guardar, as propostas ainda pendentes são retiradas — foram feitas
          sobre as condições anteriores. Os transportadores compatíveis são
          recalculados.
        </p>
      )}

      {/* --- O que transportar --- */}
      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">O que vai transportar</h2>
        <div className="mt-5 space-y-4">
          <Input
            label="Descrição breve"
            name="title"
            required
            maxLength={200}
            placeholder="Ex.: 40 sacos de cimento"
            defaultValue={carga?.title}
            error={estado.erros?.title?.[0]}
          />

          <Select
            label="Tipo de carga"
            name="cargoType"
            required
            value={tipoCarga}
            onChange={(e) => setTipoCarga(e.target.value)}
            error={estado.erros?.cargoType?.[0]}
          >
            {Object.entries(CARGO_TYPE_LABELS).map(([v, rotulo]) => (
              <option key={v} value={v}>{rotulo}</option>
            ))}
          </Select>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Peso (kg)"
              name="weightKg"
              type="number"
              min={1}
              max={60000}
              step="0.1"
              required
              placeholder="2000"
              defaultValue={carga ? Number(carga.weight_kg) : undefined}
              error={estado.erros?.weightKg?.[0]}
            />
            <Input
              label="Volume (m³)"
              name="volumeM3"
              type="number"
              min={0}
              step="0.1"
              placeholder="Opcional"
              defaultValue={carga?.volume_m3 ?? undefined}
              hint="Ajuda a encontrar camiões com espaço adequado."
              error={estado.erros?.volumeM3?.[0]}
            />
          </div>

          <Textarea
            label="Observações"
            name="description"
            maxLength={2000}
            placeholder="Condições de manuseamento, contacto no local, indicações de acesso…"
            defaultValue={carga?.description ?? undefined}
            error={estado.erros?.description?.[0]}
          />
        </div>
      </section>

      {/* --- Rota --- */}
      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">De onde para onde</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Select
            label="Origem"
            name="originId"
            required
            placeholder="Selecionar…"
            defaultValue={carga?.origin_id}
            error={estado.erros?.originId?.[0]}
          >
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.province}
              </option>
            ))}
          </Select>

          <Select
            label="Destino"
            name="destinationId"
            required
            placeholder="Selecionar…"
            defaultValue={carga?.destination_id}
            error={estado.erros?.destinationId?.[0]}
          >
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.province}
              </option>
            ))}
          </Select>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          A distância é calculada automaticamente e usada para estimar o preço.
        </p>
      </section>

      {/* --- Quando --- */}
      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Quando</h2>
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Recolher a partir de"
              name="pickupFrom"
              type="datetime-local"
              min={edicao ? undefined : hoje}
              required
              defaultValue={paraCampoDataHora(carga?.pickup_from ?? null)}
              error={estado.erros?.pickupFrom?.[0]}
            />
            <Input
              label="Recolher até"
              name="pickupUntil"
              type="datetime-local"
              min={edicao ? undefined : hoje}
              required
              defaultValue={paraCampoDataHora(carga?.pickup_until ?? null)}
              hint="Uma janela mais larga encontra mais transportadores."
              error={estado.erros?.pickupUntil?.[0]}
            />
          </div>

          <Input
            label="Prazo de entrega"
            name="deliveryDeadline"
            type="datetime-local"
            min={edicao ? undefined : hoje}
            defaultValue={paraCampoDataHora(carga?.delivery_deadline ?? null)}
            hint="Opcional. Deixe vazio se não houver prazo rígido."
            error={estado.erros?.deliveryDeadline?.[0]}
          />

          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
            <input
              type="checkbox"
              name="isUrgent"
              defaultChecked={carga?.is_urgent}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-accent-500 focus:ring-accent-500"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-navy-600">
                <Zap className="h-4 w-4 text-accent-500" aria-hidden="true" />
                Carga urgente
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Aparece destacada no topo do marketplace.
              </span>
            </span>
          </label>
        </div>
      </section>

      {/* --- Orçamento --- */}
      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Quanto está disposto a pagar</h2>
        <div className="mt-5">
          <Input
            label="Orçamento indicativo (Kz)"
            name="budgetAmount"
            type="number"
            min={0}
            step="1000"
            placeholder="Opcional"
            defaultValue={carga?.budget_amount ?? undefined}
            hint="Serve de ponto de partida à negociação. Pode deixar vazio e receber propostas."
            error={estado.erros?.budgetAmount?.[0]}
          />
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <Link
          href={edicao ? `/cargas/${carga!.id}` : '/cargas'}
          className="text-sm text-slate-500 hover:text-navy-600"
        >
          Cancelar
        </Link>
        <Botoes verificado={verificado} edicao={edicao} ehRascunho={!!ehRascunho} />
      </div>
    </form>
  );
}
