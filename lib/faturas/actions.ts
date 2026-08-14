'use server';

import { createClient, getSessionProfile } from '@/lib/supabase/server';

export type DadosFatura = {
  numero: string;
  emitidaEm: string;
  paga: boolean;
  pagaEm: string | null;
  valor: number;
  moeda: string;
  provider: 'STRIPE' | 'MULTICAIXA';
  operacao: {
    tipo: 'carga' | 'viagem';
    referencia: string;
    titulo: string;
    origem: string;
    destino: string;
  };
  comerciante: { nome: string; nif: string | null };
  transportador: { nome: string; nif: string | null };
};

/**
 * Junta os dados de um pagamento para gerar a respetiva fatura. Só
 * devolve dados a quem pertence ao tenant desse pagamento (comerciante
 * ou transportador do acordo) — a mesma regra de autorização já usada
 * no resto de lib/pagamentos/actions.ts.
 */
export async function obterDadosFatura(paymentId: string): Promise<DadosFatura | null> {
  const perfil = await getSessionProfile();
  if (!perfil) return null;

  const supabase = createClient();

  const { data: pagamento, error } = await supabase
    .from('payments')
    .select(
      'id, tenant_id, provider, status, amount, currency, paid_at, created_at, ' +
        'acordo:agreements!payments_agreement_id_fkey(' +
        'id, agreed_amount, currency, ' +
        'load:loads!agreements_load_id_fkey(reference, title, tenant_id, ' +
        'origem:locations!loads_origin_id_fkey(city), destino:locations!loads_destination_id_fkey(city)), ' +
        'trip:trips!agreements_trip_id_fkey(reference, tenant_id), ' +
        'comerciante:users!agreements_merchant_user_id_fkey(full_name, tenant_id), ' +
        'transportador:users!agreements_carrier_user_id_fkey(full_name, tenant_id))',
    )
    .eq('id', paymentId)
    .single();

  if (error || !pagamento) return null;

  const acordo = (pagamento as any).acordo;
  if (!acordo) return null;

  const tenantsEnvolvidos = [acordo.load?.tenant_id, acordo.trip?.tenant_id];
  if (!tenantsEnvolvidos.includes(perfil.tenant.id)) return null;

  // NIF de cada lado — busca-se à parte porque tax_id vive em tenants,
  // não em users.
  const { data: tenantsData } = await supabase
    .from('tenants')
    .select('id, tax_id')
    .in('id', [acordo.load?.tenant_id, acordo.trip?.tenant_id].filter(Boolean));

  const nifPorTenant = new Map((tenantsData ?? []).map((t: any) => [t.id, t.tax_id as string | null]));

  return {
    numero: `FAT-${(pagamento as any).id.slice(0, 8).toUpperCase()}`,
    emitidaEm: (pagamento as any).created_at,
    paga: (pagamento as any).status === 'PAID',
    pagaEm: (pagamento as any).paid_at,
    valor: Number((pagamento as any).amount),
    moeda: (pagamento as any).currency,
    provider: (pagamento as any).provider,
    operacao: {
      tipo: 'carga',
      referencia: acordo.load?.reference ?? acordo.trip?.reference ?? '',
      titulo: acordo.load?.title ?? '',
      origem: acordo.load?.origem?.city ?? '',
      destino: acordo.load?.destino?.city ?? '',
    },
    comerciante: {
      nome: acordo.comerciante?.full_name ?? '',
      nif: nifPorTenant.get(acordo.load?.tenant_id) ?? null,
    },
    transportador: {
      nome: acordo.transportador?.full_name ?? '',
      nif: nifPorTenant.get(acordo.trip?.tenant_id) ?? null,
    },
  };
}
