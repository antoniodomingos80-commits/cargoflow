'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import Link from 'next/link';
import { criarViagem, editarViagem, type EstadoViagem } from '@/lib/viagens/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { VEHICLE_TYPE_LABELS, type CFLocation, type Vehicle } from '@/lib/types';
import { AlertCircle, RotateCcw, Lock } from 'lucide-react';

const estadoInicial: EstadoViagem = {};

/** Valores atuais quando se está a editar em vez de criar */
export interface ViagemEditavel {
  id: string;
  vehicle_id: string;
  origin_id: string;
  destination_id: string;
  available_weight_kg: number | string;
  available_volume_m3: number | string | null;
  departure_at: string;
  estimated_arrival: string | null;
  minimum_price: number | string | null;
  is_return_trip: boolean;
  status: string;
}

function Botao({ edicao }: { edicao: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {edicao ? 'Guardar alterações' : 'Publicar viagem'}
    </Button>
  );
}

/** ISO → valor aceite por <input type="datetime-local"> na hora local */
function paraCampoDataHora(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  const desvio = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - desvio).toISOString().slice(0, 16);
}

export function FormularioViagem({
  localidades,
  veiculos,
  viagem,
}: {
  localidades: CFLocation[];
  veiculos: Vehicle[];
  /** Presente apenas em modo de edição */
  viagem?: ViagemEditavel;
}) {
  const edicao = !!viagem;
  const [estado, formAction] = useFormState(
    edicao ? editarViagem : criarViagem,
    estadoInicial,
  );
  const [veiculoId, setVeiculoId] = useState(
    viagem?.vehicle_id ?? veiculos[0]?.id ?? '',
  );

  const veiculo = veiculos.find((v) => v.id === veiculoId);
  const hoje = new Date().toISOString().slice(0, 16);

  // Com carga já adjudicada, o que foi acordado com o comerciante fica fixo
  const estruturaBloqueada = edicao && viagem!.status !== 'PUBLISHED';

  return (
    <form action={formAction} className="space-y-6">
      {edicao && <input type="hidden" name="viagemId" value={viagem!.id} />}

      {estado.erro && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{estado.erro}</span>
        </div>
      )}

      {estruturaBloqueada && (
        <div className="flex items-start gap-3 rounded-lg border border-accent-200 bg-accent-50/60 px-4 py-3 text-sm text-slate-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
          <span>
            Esta viagem já leva carga adjudicada. A rota, o veículo e a data de
            partida ficam fixos — foi com essas condições que o comerciante
            aceitou. Pode ajustar o preço mínimo, a chegada prevista e a
            capacidade.
          </span>
        </div>
      )}

      {edicao && !estruturaBloqueada && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          Ao guardar, as propostas ainda pendentes para esta viagem são
          retiradas — foram feitas sobre as condições anteriores.
        </p>
      )}

      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Veículo</h2>
        <div className="mt-5">
          <Select
            label="Camião"
            name="vehicleId"
            required
            value={veiculoId}
            onChange={(e) => setVeiculoId(e.target.value)}
            disabled={estruturaBloqueada}
            error={estado.erros?.vehicleId?.[0]}
          >
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} · {VEHICLE_TYPE_LABELS[v.type]} · até {v.max_weight_kg} kg
              </option>
            ))}
          </Select>
          {/* Campos desativados não são enviados — o valor tem de seguir à mesma */}
          {estruturaBloqueada && (
            <input type="hidden" name="vehicleId" value={veiculoId} />
          )}
        </div>
      </section>

      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Rota</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Select
            label="Parte de"
            name={estruturaBloqueada ? 'originIdVisual' : 'originId'}
            required
            placeholder="Selecionar…"
            defaultValue={viagem?.origin_id}
            disabled={estruturaBloqueada}
            error={estado.erros?.originId?.[0]}
          >
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>{l.name} · {l.province}</option>
            ))}
          </Select>
          <Select
            label="Vai para"
            name={estruturaBloqueada ? 'destinationIdVisual' : 'destinationId'}
            required
            placeholder="Selecionar…"
            defaultValue={viagem?.destination_id}
            disabled={estruturaBloqueada}
            error={estado.erros?.destinationId?.[0]}
          >
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>{l.name} · {l.province}</option>
            ))}
          </Select>
          {estruturaBloqueada && (
            <>
              <input type="hidden" name="originId" value={viagem!.origin_id} />
              <input type="hidden" name="destinationId" value={viagem!.destination_id} />
            </>
          )}
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50/50 p-4">
          <input
            type="checkbox"
            name="isReturnTrip"
            defaultChecked={viagem?.is_return_trip}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-navy-600">
              <RotateCcw className="h-4 w-4 text-brand-500" aria-hidden="true" />
              É uma viagem de retorno
            </span>
            <span className="mt-0.5 block text-xs text-slate-600">
              Regressaria vazio? Marque esta opção — estas viagens têm prioridade
              nas recomendações aos comerciantes.
            </span>
          </span>
        </label>
      </section>

      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Espaço disponível</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input
            label="Carga que pode levar (kg)"
            name="availableWeightKg"
            type="number"
            min={1}
            max={veiculo ? Number(veiculo.max_weight_kg) : 60000}
            step={100}
            required
            defaultValue={
              viagem
                ? Number(viagem.available_weight_kg)
                : veiculo
                  ? Number(veiculo.max_weight_kg)
                  : undefined
            }
            hint={
              veiculo
                ? `Máximo do veículo: ${Number(veiculo.max_weight_kg).toLocaleString('pt-AO')} kg`
                : undefined
            }
            error={estado.erros?.availableWeightKg?.[0]}
          />
          <Input
            label="Volume disponível (m³)"
            name="availableVolumeM3"
            type="number"
            min={0}
            step="0.5"
            placeholder="Opcional"
            defaultValue={
              viagem
                ? (viagem.available_volume_m3 ?? undefined)
                : (veiculo?.max_volume_m3 ?? undefined)
            }
            error={estado.erros?.availableVolumeM3?.[0]}
          />
        </div>
      </section>

      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Quando</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input
            label="Parte a"
            name={estruturaBloqueada ? 'departureAtVisual' : 'departureAt'}
            type="datetime-local"
            min={edicao ? undefined : hoje}
            required
            defaultValue={paraCampoDataHora(viagem?.departure_at ?? null)}
            disabled={estruturaBloqueada}
            error={estado.erros?.departureAt?.[0]}
          />
          <Input
            label="Chegada prevista"
            name="estimatedArrival"
            type="datetime-local"
            min={edicao ? undefined : hoje}
            defaultValue={paraCampoDataHora(viagem?.estimated_arrival ?? null)}
            hint="Opcional, mas ajuda o comerciante a decidir."
            error={estado.erros?.estimatedArrival?.[0]}
          />
          {estruturaBloqueada && (
            <input type="hidden" name="departureAt" value={viagem!.departure_at} />
          )}
        </div>
      </section>

      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Preço</h2>
        <div className="mt-5">
          <Input
            label="Valor mínimo aceite (Kz)"
            name="minimumPrice"
            type="number"
            min={0}
            step={1000}
            placeholder="Opcional"
            defaultValue={viagem?.minimum_price ?? undefined}
            hint="Abaixo deste valor não recebe propostas. Deixe vazio para receber todas."
            error={estado.erros?.minimumPrice?.[0]}
          />
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <Link
          href={edicao ? `/viagens/${viagem!.id}` : '/viagens'}
          className="text-sm text-slate-500 hover:text-navy-600"
        >
          Cancelar
        </Link>
        <Botao edicao={edicao} />
      </div>
    </form>
  );
}
