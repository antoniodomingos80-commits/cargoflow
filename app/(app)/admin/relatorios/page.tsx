import { indicadoresPlataforma, operacoesPlataforma } from '@/lib/admin/actions';
import { formatCurrency } from '@/lib/utils';
import { Activity, BarChart3, CheckCircle2, Clock3, Users } from 'lucide-react';

export const metadata = { title: 'Relatórios da plataforma' };

export default async function PaginaRelatoriosAdmin() {
  const [indicadores, operacoes] = await Promise.all([
    indicadoresPlataforma(),
    operacoesPlataforma(),
  ]);

  const porEstado = operacoes.reduce<Record<string, number>>((acc, op: any) => {
    acc[op.status] = (acc[op.status] ?? 0) + 1;
    return acc;
  }, {});

  const estadosTop = Object.entries(porEstado)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">Relatórios</h1>
        <p className="mt-1 text-sm text-slate-500">
          Indicadores globais da plataforma e distribuição operacional.
        </p>
      </header>

      {indicadores && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icone={Users} titulo="Utilizadores" valor={indicadores.utilizadores_total} />
          <Kpi icone={Clock3} titulo="Pendentes" valor={indicadores.utilizadores_pendentes} />
          <Kpi icone={CheckCircle2} titulo="Acordos" valor={indicadores.acordos} />
          <Kpi
            icone={BarChart3}
            titulo="Valor transacionado"
            valor={formatCurrency(Number(indicadores.valor_transacionado || 0))}
          />
        </div>
      )}

      <section className="cf-card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-navy-600">Distribuição por estado</h2>
          <p className="text-sm text-slate-500">Estados mais frequentes nas operações atuais.</p>
        </div>

        {estadosTop.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Sem dados operacionais no momento.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Ocorrências</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {estadosTop.map(([estado, total]) => (
                  <tr key={estado}>
                    <td className="px-5 py-3 font-medium text-navy-600">{estado}</td>
                    <td className="px-5 py-3 text-slate-600">{total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="cf-card p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-navy-600">
          <Activity className="h-4 w-4" aria-hidden="true" />
          Resumo rápido
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Total de operações analisadas: <strong>{operacoes.length}</strong>.
          {' '}Use este relatório para identificar gargalos de verificação e carga em trânsito.
        </p>
      </div>
    </div>
  );
}

function Kpi({
  icone: Icone,
  titulo,
  valor,
}: {
  icone: any;
  titulo: string;
  valor: string | number;
}) {
  return (
    <div className="cf-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {titulo}
      </div>
      <p className="mt-2 text-2xl font-bold text-navy-600">{valor}</p>
    </div>
  );
}