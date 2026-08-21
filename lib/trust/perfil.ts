'use server';

import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { calcularTrustScore, type EntradaScore, type ResultadoScore } from '@/lib/trust/score';
import type { DocumentType, EstadoCompliance, VerificationStatus } from '@/lib/types';

/**
 * Perfil de confiança — a leitura que alimenta a área "Confiança".
 *
 * Este ficheiro só REÚNE dados. O cálculo é feito por `lib/trust/score.ts`,
 * que é uma função pura e testável. A separação é deliberada: assim o motor
 * pode ser exercido caso a caso nos testes, sem base de dados nenhuma.
 *
 * Tudo o que aqui se lê vem da base de dados através do cliente de sessão, o
 * que quer dizer que o RLS se aplica: cada conta vê a sua empresa e mais
 * nenhuma. Nada é inventado — onde não há dados, o fator fica marcado como sem
 * dados e a interface diz isso em vez de mostrar um zero.
 */

export interface ResumoDocumentos {
  total: number;
  verificados: number;
  pendentes: number;
  em_analise: number;
  rejeitados: number;
  expirados: number;
  /** Documentos válidos cuja validade termina nos próximos 30 dias. */
  a_expirar: Array<{ id: string; tipo: DocumentType; expires_at: string; dias: number }>;
  /** Tipos exigidos ao perfil que ainda não têm documento válido. */
  em_falta: DocumentType[];
}

export interface ResumoFrota {
  total: number;
  conformes: number;
  pendentes: number;
  nao_conformes: number;
  expirados: number;
  documentos_em_falta: number;
  /** Motoristas registados nesta empresa. */
  motoristas: number;
  /**
   * Motoristas cuja verificação de antecedentes já expirou, ou que nunca a
   * tiveram. Sai de `drivers.background_check_valid_until`, uma coluna que
   * existia desde Agosto e que nenhum ficheiro da aplicação lia.
   */
  motoristas_sem_antecedentes: number;
}

export interface ResumoHistorico {
  operacoes_total: number;
  operacoes_concluidas: number;
  avaliacoes: number;
  avaliacao_media: number | null;
  incidentes: number;
}

export interface PerfilConfianca {
  identidade: VerificationStatus;
  empresa: VerificationStatus;
  empresa_nome: string;
  nome: string;
  documentos: ResumoDocumentos;
  frota: ResumoFrota | null;
  historico: ResumoHistorico;
  pontuacao: ResultadoScore;
  /** Valor persistido em `users.trust_score`, escrito só pelo servidor. */
  pontuacao_registada: number | null;
}

const DIAS_DE_AVISO = 30;
const PERFIS_COM_FROTA = ['CARRIER', 'COMPANY_ADMIN', 'COMPANY_STAFF'];

function diasAte(data: string): number {
  const alvo = new Date(`${data}T00:00:00Z`).getTime();
  const hoje = new Date().setUTCHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86_400_000);
}

export async function perfilDeConfianca(): Promise<PerfilConfianca | null> {
  const perfil = await getSessionProfile();
  if (!perfil) return null;

  const supabase = createClient();
  const aplicaFrota = PERFIS_COM_FROTA.includes(perfil.user.role);
  const hoje = new Date().toISOString().slice(0, 10);

  const [
    { data: exigidos },
    { data: docs },
    { data: complianceFrota },
    { data: motoristas },
    { data: acordos },
    { count: incidentes },
  ] = await Promise.all([
    supabase
      .from('verification_requirements')
      .select('document_type')
      .eq('role', perfil.user.role)
      .eq('is_required', true),

    supabase
      .from('documents')
      .select('id, type, verification, expires_at')
      .eq('tenant_id', perfil.tenant.id),

    aplicaFrota
      ? supabase
          .from('vehicle_compliance')
          .select('estado_compliance, docs_em_falta')
          .eq('tenant_id', perfil.tenant.id)
      : Promise.resolve({ data: [] as never[] }),

    aplicaFrota
      ? supabase
          .from('drivers')
          .select('id, background_check_valid_until')
          .eq('tenant_id', perfil.tenant.id)
      : Promise.resolve({ data: [] as never[] }),

    supabase
      .from('agreements')
      .select('id, carga:loads!inner(status)')
      .or(`merchant_user_id.eq.${perfil.user.id},carrier_user_id.eq.${perfil.user.id}`),

    // Incidentes = entregas com danos. `proof_of_delivery` não tem `tenant_id`
    // própria, por isso a ligação faz-se pela carga.
    supabase
      .from('proof_of_delivery')
      .select('id, loads!inner(tenant_id)', { count: 'exact', head: true })
      .eq('has_damage', true)
      .eq('loads.tenant_id', perfil.tenant.id),
  ]);

  // --- Documentos -----------------------------------------------------------
  const documentos = (docs ?? []) as Array<{
    id: string;
    type: DocumentType;
    verification: VerificationStatus;
    expires_at: string | null;
  }>;

  const conta = (estado: VerificationStatus) =>
    documentos.filter((d) => d.verification === estado).length;

  const tiposExigidos = ((exigidos ?? []) as Array<{ document_type: string }>).map(
    (r) => r.document_type,
  );

  // Válido = aprovado E dentro da validade. Um documento aprovado mas fora de
  // prazo não conta — é precisamente o caso que a expiração nocturna trata,
  // mas a pontuação não pode esperar pela noite para dizer a verdade.
  const tiposValidos = Array.from(
    new Set(
      documentos
        .filter(
          (d) =>
            d.verification === 'APPROVED' && (!d.expires_at || d.expires_at >= hoje),
        )
        .map((d) => d.type as string),
    ),
  );

  const aExpirar = documentos
    .filter((d) => d.verification === 'APPROVED' && d.expires_at)
    .map((d) => ({
      id: d.id,
      tipo: d.type,
      expires_at: d.expires_at!,
      dias: diasAte(d.expires_at!),
    }))
    .filter((d) => d.dias >= 0 && d.dias <= DIAS_DE_AVISO)
    .sort((a, b) => a.dias - b.dias);

  // --- Frota ----------------------------------------------------------------
  const linhasFrota = (complianceFrota ?? []) as Array<{
    estado_compliance: EstadoCompliance;
    docs_em_falta: number;
  }>;

  const listaMotoristas = (motoristas ?? []) as Array<{
    id: string;
    background_check_valid_until: string | null;
  }>;

  const frota: ResumoFrota | null = aplicaFrota
    ? {
        total: linhasFrota.length,
        conformes: linhasFrota.filter((l) => l.estado_compliance === 'compliant').length,
        pendentes: linhasFrota.filter((l) => l.estado_compliance === 'pending').length,
        nao_conformes: linhasFrota.filter((l) => l.estado_compliance === 'non_compliant').length,
        expirados: linhasFrota.filter((l) => l.estado_compliance === 'expired').length,
        documentos_em_falta: linhasFrota.reduce((s, l) => s + Number(l.docs_em_falta ?? 0), 0),
        motoristas: listaMotoristas.length,
        motoristas_sem_antecedentes: listaMotoristas.filter(
          (m) => !m.background_check_valid_until || m.background_check_valid_until < hoje,
        ).length,
      }
    : null;

  // --- Operações ------------------------------------------------------------
  // O PostgREST tipa a relação como array mesmo quando é um-para-um, por isso
  // ambas as formas têm de ser aceites.
  const listaAcordos = (acordos ?? []) as unknown as Array<{
    carga: { status: string } | { status: string }[] | null;
  }>;

  const acordosConcluidos = listaAcordos.filter((a) => {
    const carga = Array.isArray(a.carga) ? a.carga[0] : a.carga;
    return carga?.status === 'CONFIRMED';
  }).length;

  // --- Pontuação ------------------------------------------------------------
  const entrada: EntradaScore = {
    identidade: perfil.user.verification as VerificationStatus,
    empresa: perfil.tenant.verification as VerificationStatus,
    documentosExigidos: tiposExigidos,
    documentosValidos: tiposValidos,
    aplicaFrota,
    veiculosTotal: linhasFrota.length,
    veiculosConformes: frota?.conformes ?? 0,
    acordosTotal: listaAcordos.length,
    acordosConcluidos,
    avaliacoesTotal: perfil.user.rating_count ?? 0,
    avaliacaoMedia:
      perfil.user.rating_average !== null && perfil.user.rating_average !== undefined
        ? Number(perfil.user.rating_average)
        : null,
  };

  const pontuacao = calcularTrustScore(entrada);
  const emFaltaDocs = pontuacao.fatores.find((f) => f.chave === 'documentacao')?.emFalta ?? [];

  return {
    identidade: entrada.identidade,
    empresa: entrada.empresa,
    empresa_nome: perfil.tenant.name,
    nome: perfil.user.full_name,
    documentos: {
      total: documentos.length,
      verificados: conta('APPROVED'),
      pendentes: conta('PENDING'),
      em_analise: conta('UNDER_REVIEW'),
      rejeitados: conta('REJECTED'),
      expirados: conta('EXPIRED'),
      a_expirar: aExpirar,
      em_falta: emFaltaDocs as DocumentType[],
    },
    frota,
    historico: {
      operacoes_total: listaAcordos.length,
      operacoes_concluidas: acordosConcluidos,
      avaliacoes: entrada.avaliacoesTotal,
      avaliacao_media: entrada.avaliacaoMedia,
      incidentes: incidentes ?? 0,
    },
    pontuacao,
    pontuacao_registada:
      perfil.user.trust_score !== null && perfil.user.trust_score !== undefined
        ? Number(perfil.user.trust_score)
        : null,
  };
}
