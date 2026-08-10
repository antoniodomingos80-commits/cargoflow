'use client';

import { useEffect, useState } from 'react';
import { listarPendentes } from '@/lib/admin/verificacoes';
import { VerificacaoCard } from '@/components/admin/VerificacaoCard';

type Verificacao = {
  id: string;
  email: string;
  full_name: string | null;
  verification_status: string;
};

export default function VerificacoesPage() {
  const [usuarios, setUsuarios] = useState<Verificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  async function carregarPendentes() {
    try {
      setLoading(true);
      setErro('');
      const dados = await listarPendentes();
      setUsuarios(dados);
    } catch (err) {
      setErro('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void carregarPendentes();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Verificações</h1>
          <p className="text-gray-600 mt-1">Aprovar ou rejeitar utilizadores pendentes</p>
        </div>
        <button
          onClick={carregarPendentes}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold"
        >
          🔄 Recarregar
        </button>
      </div>

      {erro && <div className="mb-6 p-4 bg-red-100 rounded text-red-700">{erro}</div>}

      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <p className="text-sm text-blue-900">
          <span className="font-bold text-lg">{usuarios.length}</span> utilizadores pendentes
        </p>
      </div>

      {loading ? (
        <p className="text-center text-gray-600 py-12">Carregando...</p>
      ) : usuarios.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded">
          <p className="text-gray-600 font-semibold">✅ Nenhum pendente!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {usuarios.map((usuario) => (
            <VerificacaoCard key={usuario.id} usuario={usuario} />
          ))}
        </div>
      )}
    </div>
  );
}