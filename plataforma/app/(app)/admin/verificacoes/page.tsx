import { listarVerificacoes } from '@/lib/admin/verificacoes';
import { VerificacaoCard } from '@/components/admin/VerificacaoCard';

export const metadata = { title: 'Verificacoes pendentes' };

export default async function PaginaVerificacoes() {
  const verificacoes = await listarVerificacoes();

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Verificacoes</h1>
        <p className="text-gray-600">Contas a espera de aprovacao</p>
      </div>

      <div className="mb-4 p-3 bg-blue-50 rounded">
        <p className="text-sm">
          <span className="font-bold text-lg">{verificacoes.length}</span>{' '}
          {verificacoes.length === 1 ? 'pedido pendente' : 'pedidos pendentes'}
        </p>
      </div>

      {verificacoes.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded">
          <p className="text-gray-600">Tudo em dia - sem verificacoes pendentes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {verificacoes.map((v: any) => (
            <VerificacaoCard key={v.user_id} verificacao={v} />
          ))}
        </div>
      )}
    </div>
  );
}
