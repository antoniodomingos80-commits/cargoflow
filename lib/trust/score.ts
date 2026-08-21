/**
 * Motor de pontuação de confiança.
 *
 * Função pura: mesmas entradas, mesmo resultado, sempre. Não lê a base de
 * dados, não lê o relógio, não tem estado. É por isso que se pode testar caso
 * a caso, e é por isso que a explicação que devolve é confiável — não é uma
 * narrativa escrita à parte do cálculo, é o próprio cálculo a dizer o que fez.
 *
 * ONDE VIVE A VERDADE
 *
 * Existe uma segunda implementação em SQL (`cf_trust_score`), necessária
 * porque a tarefa nocturna do pg_cron corre dentro da base de dados e não tem
 * Node. Duas implementações da mesma regra divergem sempre — a menos que
 * alguém verifique. Por isso `tests/trust-score.mjs` compara os pesos dos dois
 * ficheiros e falha se deixarem de bater certo.
 *
 * PONTUAÇÃO PARCIAL
 *
 * Um fator sem dados fica FORA do cálculo em vez de contar zero. Uma conta
 * recente, honesta, que ainda não teve nenhuma operação não deve ser
 * apresentada como pouco fiável — só como pouco conhecida. A diferença
 * importa: a primeira é uma acusação, a segunda é um facto.
 */

export type ChaveFator =
  | 'identidade'
  | 'empresa'
  | 'documentacao'
  | 'frota'
  | 'operacoes'
  | 'avaliacoes';

/**
 * Pesos. Somam 100.
 *
 * Se algum destes números mudar, tem de mudar também em
 * `supabase/migrations/20260821_p1_trust_compliance.sql`. O teste de paridade
 * existe exactamente para apanhar quem se esquecer.
 */
export const PESOS: Record<ChaveFator, number> = {
  identidade: 20,
  empresa: 15,
  documentacao: 25,
  frota: 15,
  operacoes: 15,
  avaliacoes: 10,
};

export const ROTULOS: Record<ChaveFator, string> = {
  identidade: 'Identidade',
  empresa: 'Empresa',
  documentacao: 'Documentação obrigatória',
  frota: 'Frota conforme',
  operacoes: 'Cumprimento das operações',
  avaliacoes: 'Avaliações recebidas',
};

/** Estados de verificação, tal como a base de dados os escreve. */
export type EstadoVerificacao =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED';

export interface EntradaScore {
  /** Estado de verificação da identidade da pessoa. */
  identidade: EstadoVerificacao;
  /** Estado de verificação da empresa a que pertence. */
  empresa: EstadoVerificacao;
  /** Tipos de documento exigidos ao perfil desta conta. */
  documentosExigidos: string[];
  /** Tipos exigidos que têm documento aprovado e dentro da validade. */
  documentosValidos: string[];
  /** Verdadeiro para perfis que operam frota (camionista, empresa). */
  aplicaFrota: boolean;
  veiculosTotal: number;
  veiculosConformes: number;
  acordosTotal: number;
  acordosConcluidos: number;
  avaliacoesTotal: number;
  /** Média de 0 a 5. Nulo quando não há avaliações. */
  avaliacaoMedia: number | null;
}

export interface Fator {
  chave: ChaveFator;
  rotulo: string;
  peso: number;
  /** 0 a 1. Sem dados é sempre 0, mas nesse caso o peso não conta. */
  valor: number;
  /** Pontos que este fator contribuiu de facto. */
  pontos: number;
  temDados: boolean;
  /** O facto que produziu o valor, em linguagem que o utilizador percebe. */
  evidencia: string;
  /** Só nos fatores em que faz sentido: o que falta para subir. */
  emFalta?: string[];
}

export interface ResultadoScore {
  /** 0 a 100. Nulo quando nenhum fator tem dados. */
  score: number | null;
  fatores: Fator[];
  /** Fatores excluídos do cálculo, com o peso que teriam. */
  indisponiveis: Array<{ chave: ChaveFator; rotulo: string; peso: number; motivo: string }>;
  /** Soma dos pesos que entraram no cálculo. */
  pesoComDados: number;
  pesoMaximo: number;
  /** Uma frase que resume porque é que a pontuação é a que é. */
  explicacao: string;
}

const APROVADO = (e: EstadoVerificacao) => (e === 'APPROVED' ? 1 : 0);

function evidenciaDeEstado(e: EstadoVerificacao, sujeito: string): string {
  switch (e) {
    case 'APPROVED':
      return `${sujeito} verificada`;
    case 'UNDER_REVIEW':
      return `${sujeito} em análise`;
    case 'PENDING':
      return `${sujeito} por verificar`;
    case 'REJECTED':
      return `${sujeito} recusada`;
    case 'EXPIRED':
      return `Verificação d${sujeito === 'Identidade' ? 'a identidade' : 'a empresa'} expirada`;
  }
}

export function calcularTrustScore(entrada: EntradaScore): ResultadoScore {
  const fatores: Fator[] = [];
  const indisponiveis: ResultadoScore['indisponiveis'] = [];

  function comDados(
    chave: ChaveFator,
    valor: number,
    evidencia: string,
    emFalta?: string[],
  ) {
    const peso = PESOS[chave];
    const limitado = Math.min(Math.max(valor, 0), 1);
    fatores.push({
      chave,
      rotulo: ROTULOS[chave],
      peso,
      valor: limitado,
      pontos: peso * limitado,
      temDados: true,
      evidencia,
      ...(emFalta && emFalta.length > 0 ? { emFalta } : {}),
    });
  }

  function semDados(chave: ChaveFator, motivo: string) {
    const peso = PESOS[chave];
    fatores.push({
      chave,
      rotulo: ROTULOS[chave],
      peso,
      valor: 0,
      pontos: 0,
      temDados: false,
      evidencia: motivo,
    });
    indisponiveis.push({ chave, rotulo: ROTULOS[chave], peso, motivo });
  }

  // --- Identidade: sempre há um estado, portanto sempre há dados ------------
  comDados(
    'identidade',
    APROVADO(entrada.identidade),
    evidenciaDeEstado(entrada.identidade, 'Identidade'),
  );

  // --- Empresa --------------------------------------------------------------
  comDados('empresa', APROVADO(entrada.empresa), evidenciaDeEstado(entrada.empresa, 'Empresa'));

  // --- Documentação ---------------------------------------------------------
  const exigidos = entrada.documentosExigidos.length;
  if (exigidos > 0) {
    const validos = entrada.documentosValidos.filter((t) =>
      entrada.documentosExigidos.includes(t),
    );
    const emFalta = entrada.documentosExigidos.filter((t) => !validos.includes(t));
    comDados(
      'documentacao',
      validos.length / exigidos,
      `${validos.length} de ${exigidos} documentos obrigatórios válidos`,
      emFalta,
    );
  } else {
    semDados('documentacao', 'Sem documentos exigidos para este perfil');
  }

  // --- Frota ----------------------------------------------------------------
  if (!entrada.aplicaFrota) {
    semDados('frota', 'Não se aplica a este perfil');
  } else if (entrada.veiculosTotal === 0) {
    semDados('frota', 'Ainda não há veículos registados');
  } else {
    comDados(
      'frota',
      entrada.veiculosConformes / entrada.veiculosTotal,
      `${entrada.veiculosConformes} de ${entrada.veiculosTotal} veículos conformes`,
    );
  }

  // --- Cumprimento das operações -------------------------------------------
  if (entrada.acordosTotal === 0) {
    semDados('operacoes', 'Ainda não há operações fechadas');
  } else {
    comDados(
      'operacoes',
      entrada.acordosConcluidos / entrada.acordosTotal,
      `${entrada.acordosConcluidos} de ${entrada.acordosTotal} operações concluídas`,
    );
  }

  // --- Avaliações -----------------------------------------------------------
  // Zero avaliações é ausência de informação, não uma avaliação de zero.
  if (entrada.avaliacoesTotal === 0 || entrada.avaliacaoMedia === null) {
    semDados('avaliacoes', 'Ainda não recebeu avaliações');
  } else {
    comDados(
      'avaliacoes',
      entrada.avaliacaoMedia / 5,
      `${entrada.avaliacaoMedia.toFixed(1)} em 5, com ${entrada.avaliacoesTotal} ${
        entrada.avaliacoesTotal === 1 ? 'avaliação' : 'avaliações'
      }`,
    );
  }

  const pesoComDados = fatores.filter((f) => f.temDados).reduce((s, f) => s + f.peso, 0);
  const pontos = fatores.reduce((s, f) => s + f.pontos, 0);
  const pesoMaximo = Object.values(PESOS).reduce((s, p) => s + p, 0);

  const score = pesoComDados === 0 ? null : Math.round((100 * pontos) / pesoComDados);

  return {
    score,
    fatores,
    indisponiveis,
    pesoComDados,
    pesoMaximo,
    explicacao: explicar(score, pesoComDados, pesoMaximo, fatores, indisponiveis),
  };
}

function explicar(
  score: number | null,
  pesoComDados: number,
  pesoMaximo: number,
  fatores: Fator[],
  indisponiveis: ResultadoScore['indisponiveis'],
): string {
  if (score === null) {
    return 'Não há ainda nenhum dado sobre esta conta, por isso não existe pontuação.';
  }

  const partes: string[] = [];

  const completos = fatores.filter((f) => f.temDados && f.valor === 1);
  const incompletos = fatores.filter((f) => f.temDados && f.valor < 1);

  if (completos.length > 0) {
    partes.push(
      `${completos.map((f) => f.rotulo.toLowerCase()).join(', ')} ${
        completos.length === 1 ? 'está completo' : 'estão completos'
      }`,
    );
  }

  if (incompletos.length > 0) {
    const perdidos = incompletos.reduce((s, f) => s + (f.peso - f.pontos), 0);
    partes.push(
      `${incompletos.map((f) => f.rotulo.toLowerCase()).join(', ')} ${
        incompletos.length === 1 ? 'custa' : 'custam'
      } ${Math.round(perdidos)} pontos`,
    );
  }

  const base =
    partes.length > 0
      ? `Pontuação ${score} em 100: ${partes.join('; ')}.`
      : `Pontuação ${score} em 100.`;

  if (pesoComDados < pesoMaximo) {
    return `${base} Calculada sobre ${pesoComDados} dos ${pesoMaximo} pontos possíveis — ${indisponiveis
      .map((i) => i.rotulo.toLowerCase())
      .join(', ')} ainda não ${indisponiveis.length === 1 ? 'tem' : 'têm'} dados.`;
  }

  return base;
}
