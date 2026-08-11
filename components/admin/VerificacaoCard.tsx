﻿'use client';

type Verificacao = {
  id: string;
  email: string;
  full_name: string | null;
  verification: string;
};

export function VerificacaoCard({
  usuario,
  verificacao,
  onAprovar,
  onRejeitar,
}: {
  usuario?: Verificacao;
  verificacao?: Verificacao;
  onAprovar?: (id: string) => void;
  onRejeitar?: (id: string, motivo: string) => void;
}) {
  const v = verificacao ?? usuario!;
  const handleAprovar = () => (onAprovar ? onAprovar(v.id) : undefined);
  const handleRejeitar = () =>
    onRejeitar ? onRejeitar(v.id, 'Documentação incompleta') : undefined;

  return (
    <div className="bg-white border rounded-lg p-4 shadow">
      <p className="font-semibold">{v.full_name || 'Sem nome'}</p>
      <p className="text-sm text-gray-600">{v.email}</p>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleAprovar}
          className="flex-1 px-3 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700"
        >
          ✅ Aprovar
        </button>
        <button
          onClick={handleRejeitar}
          className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm font-semibold hover:bg-red-700"
        >
          ❌ Rejeitar
        </button>
      </div>
    </div>
  );
}
