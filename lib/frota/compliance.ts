'use server';

import { createClient, getSessionProfile } from '@/lib/supabase/server';
import type { EstadoCompliance } from '@/lib/types';

/**
 * Conformidade da frota.
 *
 * Lê a vista `vehicle_compliance`, que deriva o estado dos documentos do
 * veículo e das datas de validade que já viviam em `vehicles` — e que, até
 * agora, nenhum ficheiro da aplicação lia.
 *
 * A vista é `security_invoker`, por isso corre com o RLS de quem a consulta:
 * cada empresa vê a sua frota e mais nenhuma.
 */

export interface ComplianceVeiculo {
  vehicle_id: string;
  plate: string;
  estado_compliance: EstadoCompliance;
  docs_aprovados: number;
  docs_em_analise: number;
  docs_rejeitados: number;
  docs_expirados: number;
  docs_em_falta: number;
  tipos_em_falta: string[];
  valido_ate: string | null;
}

export async function listarComplianceFrota(): Promise<Record<string, ComplianceVeiculo>> {
  const perfil = await getSessionProfile();
  if (!perfil) return {};

  const supabase = createClient();
  const { data, error } = await supabase
    .from('vehicle_compliance')
    .select('*')
    .eq('tenant_id', perfil.tenant.id);

  if (error) {
    console.error('Erro ao ler a conformidade da frota:', error.message);
    return {};
  }

  const linhas = (data ?? []) as ComplianceVeiculo[];
  return Object.fromEntries(linhas.map((l) => [l.vehicle_id, l]));
}
