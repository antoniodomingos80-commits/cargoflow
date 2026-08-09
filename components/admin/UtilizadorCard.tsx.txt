'use client';

import { useState } from 'react';
import { suspenderUtilizador, ativarUtilizador } from '@/lib/admin/utilizadores';

interface UtilizadorCardProps {
  usuario: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    role: string;
    created_at: string;
    verification_status: string;
    banned: boolean;
  };
}

export function UtilizadorCard({ usuario }: UtilizadorCardProps) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [motivo, setMotivo] = useState('');
  const [mostrarMotivo, setMostrarMotivo] = useState(false);

  const handleSuspender = async () => {
    if (!motivo.trim()) {
      setErro('Motivo obrigatório');
      return;
    }
    try {
      setLoading(true);
      await suspenderUtilizador(usuario.id, motivo);
      setErro('');
      setMotivo('');
      setMostrarMotivo(false);
    } catch (err) {
      setErro('Erro');
    } finally {
      setLoading(false);
    }
  };

  const handleAtivar = async () => {
    try {
      setLoading(true);
      await ativarUtilizador(usuario.id);
      setErro('');
    } catch (err) {
      setErro('Erro');
    } finally {
      setLoading(false);
    }
  };

  const dataCriacao = new Date(usuario.created_at).toLocaleDateString('pt-AO');

  return (
    <div className="border rounded-lg p-4 bg-white">
      {erro && <div className="mb-3 p-2 bg-red-100 rounded text-red-700 text-sm">{erro}</div>}

      <div className="mb-3">
        <h3 className="font-bold">{usuario.full_name || 'Sem nome'}</h3>
        <p className="text-sm text-gray-600">{usuario.email}</p>
        <p className="text-sm text-gray-600">Tel: {usuario.phone || '-'}</p>
        
        <div className="flex gap-2 mt-2 text-xs">
          <span className="px-2 py-1 bg-blue-100 rounded">
            {usuario.role === 'SHIPPER' ? '📦 Comerciante' : '🚚 Transportador'}
          </span>
          <span className="px-2 py-1 bg-yellow-100 rounded">
            {usuario.verification_status === 'APPROVED' ? '✅ Verificado' : '⏳ Pendente'}
          </span>
          <span className={`px-2 py-1 rounded ${usuario.banned ? 'bg-red-100' : 'bg-green-100'}`}>
            {usuario.banned ? '🚫 Suspenso' : '✅ Ativo'}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-2">Registado: {dataCriacao}</p>
      </div>

      <div className="border-t pt-3">
        {!mostrarMotivo ? (
          <div className="flex gap-2">
            {!usuario.banned ? (
              <button
                onClick={() => setMostrarMotivo(true)}
                disabled={loading}
                className="flex-1 px-3 py-1 bg-red-600 text-white text-sm rounded font-semibold hover:bg-red-700 disabled:bg-gray-400"
              >
                🚫 Suspender
              </button>
            ) : (
              <button
                onClick={handleAtivar}
                disabled={loading}
                className="flex-1 px-3 py-1 bg-green-600 text-white text-sm rounded font-semibold hover:bg-green-700 disabled:bg-gray-400"
              >
                ✅ Ativar
              </button>
            )}
          </div>
        ) : (
          <div>
            <textarea
              placeholder="Motivo..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full p-2 border rounded text-sm mb-2"
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSuspender}
                disabled={loading || !motivo.trim()}
                className="flex-1 px-3 py-1 bg-red-600 text-white text-sm rounded disabled:bg-gray-400"
              >
                Confirmar
              </button>
              <button
                onClick={() => { setMostrarMotivo(false); setMotivo(''); }}
                className="flex-1 px-3 py-1 bg-gray-400 text-white text-sm rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}