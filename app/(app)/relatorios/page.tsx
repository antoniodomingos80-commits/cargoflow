import { redirect } from 'next/navigation';
import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/utils';
import { BarChart3, Package, Truck, CheckCircle2 } from 'lucide-react';

export const metadata = { title: 'Relatórios' };

type SerieMensal = { mes: string; cargas: number; viagens: number };

function chaveMes(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ultimosMeses(n: number): string[] {
  const agora = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function tituloMes(chave: string) {
  const [ano, mes] = chave.split('-').map(Number);
  return new Date(ano, (mes ?? 1) - 1, 1).toLocaleDateString('pt-AO', {
    month: 'short',
    year: '2-digit',
  });
}

export default async function PaginaRelatorios() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  if (perfil.user.role === 'PLATFORM_ADMIN') {
    redirect('/admin/relatorios');
  }

  const supabase = createClient();
  const [loadsRes, tripsRes] = await Promise.all([
    supabase
      .from('loads')
      .select('id, status, budget_amount, created_at')
      .eq('tenant_id', perfil.tenant.id)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('trips')
      .select('id, status, created_at')
      .eq('tenant_id', perfil.tenant.id)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const loads = loadsRes.data ?? [];
  const trips = tripsRes.data ?? [];

  const cargasAtivas = loads.filter((l) => ['PUBLISHED', 'NEGOTIATING', 'ASSIGNED'].includes(l.status)).length;
  const cargasConcluidas = loads.filter((l) => ['DELIVERED', 'CONFIRMED'].includes(l.status)).length;
  const viagensAtivas = trips.filter((t) => ['PUBLISHED', 'PARTIALLY_BOOKED', 'IN_PROGRESS'].includes(t.status)).length;
  const valorOrcamentos = loads.reduce((acc, l) => acc + Number(l.budget_amount ?? 0), 0);

  const eixo = ultimosMeses(6);
  const mapaLoads = new Map<string, number>();
  const mapaTrips = new Map<string, number>();

  for (const l of loads) {
    const k = chaveMes(l.created_at);
    mapaLoads.set(k, (mapaLoads.get(k) ?? 0) + 1);
  }
  for (const t of trips) {
    const k = chaveMes(t.created_at);
    mapaTrips.set(k, (mapaTrips.get(k) ?? 0) + 1);
  }

  const serie: SerieMensal[] = eixo.map((m) => ({
    mes: tituloMes(m),
    cargas: mapaLoads.get(m) ?? 0,
    viagens: mapaTrips.get(m) ?? 0,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">Relatórios</h1>
        <p className="mt-1 text-sm text-slate-500">
          Visão rápida da atividade da sua empresa nos últimos meses.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icone={Package} titulo="Cargas ativas" valor={cargasAtivas} />
        <Kpi icone={CheckCircle2} titulo="Cargas concluídas" valor={cargasConcluidas} />
        <Kpi icone={Truck} titulo="Viagens ativas" valor={viagensAtivas} />
        <Kpi icone={BarChart3} titulo="Orçamentos publicados" valor={formatCurrency(valorOrcamentos)} />
      </div>

      <section className="cf-card overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-navy-600">Atividade mensal</h2>
          <p className="text-sm text-slate-500">Cargas e viagens criadas por mês (últimos 6 meses).</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Mês</th>
                <th className="px-5 py-3">Cargas</th>
                <th className="px-5 py-3">Viagens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {serie.map((linha) => (
                <tr key={linha.mes}>
                  <td className="px-5 py-3 font-medium text-navy-600">{linha.mes}</td>
                  <td className="px-5 py-3 text-slate-600">{linha.cargas}</td>
                  <td className="px-5 py-3 text-slate-600">{linha.viagens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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