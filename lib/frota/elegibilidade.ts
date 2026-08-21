import { DOCUMENT_TYPE_LABELS, type DocumentType, type EstadoCompliance } from '@/lib/types';

/**
 * Quando é que um veículo pode ser usado numa operação.
 *
 *   compliant      → elegível
 *   pending        → elegível, com aviso do que falta
 *   non_compliant  → NÃO elegível
 *   expired        → NÃO elegível
 *   verificação REJECTED ou EXPIRED → NÃO elegível
 *
 * `pending` continua elegível de propósito. Os dez veículos que hoje existem
 * em produção estão todos em `pending` — nenhum tem livrete, seguro ou
 * inspeção carregados — e sete deles já publicaram viagens. Bloquear `pending`
 * parava a plataforma. Deixa-se operar enquanto a documentação está a caminho,
 * dizendo com clareza o que falta.
 *
 * Função pura, sem base de dados e sem relógio: dá para exercer caso a caso.
 * A mesma regra existe em SQL, em `cf_veiculo_elegivel()`, porque a interface
 * não é onde a segurança vive. As duas são comparadas por
 * `tests/elegibilidade-veiculo.mjs`.
 */

export interface Elegibilidade {
  elegivel: boolean;
  /** Nulo só quando está tudo em ordem. Em `pending` é um aviso, não um bloqueio. */
  motivo: string | null;
  /** Distingue "não pode" de "pode, mas atenção". */
  gravidade: 'ok' | 'aviso' | 'bloqueio';
}

export function avaliarElegibilidade(
  verificacao: string,
  compliance: EstadoCompliance,
  tiposEmFalta: string[] = [],
): Elegibilidade {
  if (verificacao === 'REJECTED') {
    return {
      elegivel: false,
      motivo: 'Verificação do veículo recusada',
      gravidade: 'bloqueio',
    };
  }
  if (verificacao === 'EXPIRED') {
    return {
      elegivel: false,
      motivo: 'Verificação do veículo expirada',
      gravidade: 'bloqueio',
    };
  }
  if (compliance === 'expired') {
    return {
      elegivel: false,
      motivo: 'Seguro ou inspeção fora de validade',
      gravidade: 'bloqueio',
    };
  }
  if (compliance === 'non_compliant') {
    return {
      elegivel: false,
      motivo: 'Documentação do veículo recusada',
      gravidade: 'bloqueio',
    };
  }
  if (compliance === 'pending') {
    const falta = tiposEmFalta
      .map((t) => DOCUMENT_TYPE_LABELS[t as DocumentType] ?? t)
      .join(', ');
    return {
      elegivel: true,
      motivo: falta ? `Documentação por concluir: ${falta}` : 'Documentação em análise',
      gravidade: 'aviso',
    };
  }
  return { elegivel: true, motivo: null, gravidade: 'ok' };
}

export interface VeiculoElegivel {
  id: string;
  plate: string;
  type: string;
  max_weight_kg: number;
  max_volume_m3: number | null;
  verification: string;
  estado_compliance: EstadoCompliance;
  tipos_em_falta: string[];
  valido_ate: string | null;
  elegivel: boolean;
  motivo: string | null;
  gravidade: Elegibilidade['gravidade'];
}
