'use client';

import { useEffect, useState } from 'react';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import { listarUtilizadores, suspenderUtilizador, ativarUtilizador } from '@/lib/admin/utilizadores';
import { UtilizadorCard } from '@/components/admin/UtilizadorCard';

type Usuario = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  verification: string;
  banned: boolean;
  created_at: string;
};

export default function UtilizadoresPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('TODOS');

  async function carregarUtilizadores() {
    try {
      setLoading(true);
      setErro('');
      const dados = await listarUtilizadores();
      setUsuarios(dados || []);
    } catch (err) {
      setErro('Erro ao carregar utilizadores');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void carregarUtilizadores();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleSuspender = async (id: string) => {
    try {
      await suspenderUtilizador(id);
      carregarUtilizadores();
    } catch (err) {
      setErro('Erro ao suspender utilizador');
      console.error(err);
    }
  };

  const handleAtivar = async (id: string) => {
    try {
      await ativarUtilizador(id);
      carregarUtilizadores();
    } catch (err) {
      setErro('Erro ao ativar utilizador');
      console.error(err);
    }
  };

  const filtrados = usuarios.filter(u => {
    if (filtro === 'ATIVOS') return !u.banned;
    if (filtro === 'SUSPENSOS') return u.banned;
    if (filtro === 'VERIFICADOS') return u.verification === 'APPROVED';
    return true;
  });

  return (
    <PageContainer largura="larga">
      <PageHeader
        titulo="Utilizadores"
        descricao={`${usuarios.length} ${usuarios.length === 1 ? 'conta registada' : 'contas registadas'} na plataforma.`}
        accoes={
          <Button variant="outline" size="sm" onClick={carregarUtilizadores} loading={loading}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Recarregar
          </Button>
        }
      />

      {erro && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {['TODOS', 'ATIVOS', 'SUSPENSOS', 'VERIFICADOS'].map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filtro === f ? 'bg-navy-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            {f} ({usuarios.filter(u => {
              if (f === 'ATIVOS') return !u.banned;
              if (f === 'SUSPENSOS') return u.banned;
              if (f === 'VERIFICADOS') return u.verification === 'APPROVED';
              return true;
            }).length})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-600 py-8">Carregando utilizadores...</p>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded">
          <p className="text-gray-600">Nenhum utilizador encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((u) => (
            <div key={u.id} className="bg-white border rounded-lg p-4 shadow">
              <div className="mb-3">
                <p className="font-semibold text-lg">{u.full_name || 'Sem nome'}</p>
                <p className="text-sm text-gray-600">{u.email}</p>
                {u.phone && <p className="text-sm text-gray-600">{u.phone}</p>}
              </div>

              <div className="mb-3 flex gap-2">
                <span className={`px-2 py-1 text-xs rounded font-semibold ${
                  u.verification === 'APPROVED'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {u.verification === 'APPROVED' ? '✅ Verificado' : '⏳ Pendente'}
                </span>
                {u.banned && <span className="px-2 py-1 text-xs rounded font-semibold bg-red-100 text-red-800">🚫 Suspenso</span>}
              </div>

              <p className="text-xs text-gray-500 mb-3">
                Membro desde {new Date(u.created_at).toLocaleDateString('pt-AO')}
              </p>

              <div className="flex gap-2">
                {u.banned ? (
                  <button
                    onClick={() => handleAtivar(u.id)}
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700"
                  >
                    ✅ Ativar
                  </button>
                ) : (
                  <button
                    onClick={() => handleSuspender(u.id)}
                    className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm font-semibold hover:bg-red-700"
                  >
                    🚫 Suspender
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}