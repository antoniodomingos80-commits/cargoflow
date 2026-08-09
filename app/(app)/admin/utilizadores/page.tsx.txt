'use client';

import { useEffect, useState } from 'react';
import { listarUtilizadores } from '@/lib/admin/utilizadores';
import { UtilizadorCard } from '@/components/admin/UtilizadorCard';

export default function UtilizadoresPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('TODOS');

  useEffect(() => {
    carregarUtilizadores();
  }, []);

  const carregarUtilizadores = async () => {
    try {
      setLoading(true);
      setErro('');
      const dados = await listarUtilizadores();
      setUsuarios(dados);
    } catch (err) {
      setErro('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  const filtrados = usuarios.filter(u => {
    if (filtro === 'ATIVOS') return !u.banned;
    if (filtro === 'SUSPENSOS') return u.banned;
    if (filtro === 'VERIFICADOS') return u.verification_status === 'APPROVED';
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Utilizadores</h1>
          <p className="text-gray-600">Gerenciar contas</p>
        </div>
        <button
          onClick={carregarUtilizadores}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
        >
          🔄 Recarregar
        </button>
      </div>

      {erro && <div className="mb-4 p-3 bg-red-100 rounded text-red-700">{erro}</div>}

      <div className="mb-4 p-3 bg-blue-50 rounded">
        <p className="text-sm"><span className="font-bold text-lg">{usuarios.length}</span> utilizadores</p>
      </div>

      <div className="mb-4 flex gap-2 flex-wrap">
        {['TODOS', 'ATIVOS', 'SUSPENSOS', 'VERIFICADOS'].map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1 rounded text-sm font-semibold ${
              filtro === f ? 'bg-blue-600 text-white' : 'bg-gray-200 hover:bg-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-600">Carregando...</p>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded">
          <p className="text-gray-600">Nenhum utilizador</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtrados.map((u) => (
            <UtilizadorCard key={u.id} usuario={u} />
          ))}
        </div>
      )}
    </div>
  );
}