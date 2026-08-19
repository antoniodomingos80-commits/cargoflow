'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { blockUser, unblockUser, type Bloqueio } from '@/lib/trust/actions';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS, type UserRole } from '@/lib/types';

export interface UtilizadorSelecionavel {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
}

/** Motivos frequentes — a escolha fica no registo para leitura posterior. */
const MOTIVOS = [
  { codigo: 'FRAUD', rotulo: 'Suspeita de fraude' },
  { codigo: 'FAKE_DOCS', rotulo: 'Documentação falsa ou inválida' },
  { codigo: 'NO_SHOW', rotulo: 'Faltas repetidas a recolhas' },
  { codigo: 'ABUSE', rotulo: 'Abuso ou conduta imprópria' },
  { codigo: 'OTHER', rotulo: 'Outro' },
];

function dataLegivel(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Bloqueio e levantamento de bloqueio de contas.
 *
 * O bloqueio impede o utilizador de operar no marketplace; o motivo é
 * obrigatório porque fica no histórico de auditoria e é o que justifica a
 * decisão se ela for contestada.
 */
export function BlocklistManager({
  bloqueios,
  utilizadores,
}: {
  bloqueios: Bloqueio[];
  utilizadores: UtilizadorSelecionavel[];
}) {
  const router = useRouter();
  const [aProcessar, iniciar] = useTransition();
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [utilizadorId, setUtilizadorId] = useState('');
  const [codigoMotivo, setCodigoMotivo] = useState(MOTIVOS[0].codigo);
  const [motivo, setMotivo] = useState('');

  const jaBloqueados = new Set(bloqueios.map((b) => b.user_id));
  const disponiveis = utilizadores.filter((u) => !jaBloqueados.has(u.id));

  function limparMensagens() {
    setErro('');
    setSucesso('');
  }

  function submeterBloqueio(evento: React.FormEvent) {
    evento.preventDefault();
    limparMensagens();

    if (!utilizadorId) {
      setErro('Escolha o utilizador a bloquear.');
      return;
    }
    if (!motivo.trim()) {
      setErro('Descreva o motivo — fica no histórico de auditoria.');
      return;
    }

    iniciar(async () => {
      try {
        await blockUser(utilizadorId, motivo.trim(), codigoMotivo);
        setSucesso('Utilizador bloqueado.');
        setUtilizadorId('');
        setMotivo('');
        router.refresh();
      } catch (e: any) {
        setErro(e?.message ?? 'Não foi possível bloquear o utilizador.');
      }
    });
  }

  function levantar(bloqueio: Bloqueio) {
    limparMensagens();
    iniciar(async () => {
      try {
        await unblockUser(bloqueio.id);
        setSucesso('Bloqueio levantado.');
        router.refresh();
      } catch (e: any) {
        setErro(e?.message ?? 'Não foi possível levantar o bloqueio.');
      }
    });
  }

  return (
    <section className="cf-card p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-bold text-navy-600">Contas bloqueadas</h2>
        <span className="text-xs text-slate-500">
          {bloqueios.length} {bloqueios.length === 1 ? 'activo' : 'activos'}
        </span>
      </div>

      {erro ? (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      ) : null}
      {sucesso ? (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {sucesso}
        </p>
      ) : null}

      <form onSubmit={submeterBloqueio} className="mb-6 space-y-3 rounded-lg bg-slate-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Utilizador</span>
            <select
              value={utilizadorId}
              onChange={(e) => setUtilizadorId(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Escolher…</option>
              {disponiveis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} — {ROLE_LABELS[u.role as UserRole] ?? u.role}
                  {u.email ? ` (${u.email})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Motivo</span>
            <select
              value={codigoMotivo}
              onChange={(e) => setCodigoMotivo(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              {MOTIVOS.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.rotulo}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">
            Descrição (obrigatória)
          </span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="O que motivou o bloqueio? Fica registado na auditoria."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </label>

        <Button type="submit" variant="danger" size="sm" loading={aProcessar}>
          Bloquear utilizador
        </Button>
      </form>

      {bloqueios.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Nenhuma conta bloqueada de momento.
        </p>
      ) : (
        <ul className="space-y-3">
          {bloqueios.map((bloqueio) => (
            <li
              key={bloqueio.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-600">
                  {bloqueio.utilizador?.full_name ?? 'Utilizador removido'}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{bloqueio.reason}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Bloqueado a {dataLegivel(bloqueio.blocked_at)}
                  {bloqueio.reason_code ? ` · ${bloqueio.reason_code}` : ''}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => levantar(bloqueio)}
                disabled={aProcessar}
              >
                Levantar bloqueio
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
