/**
 * Tradução de erros da base de dados para mensagens úteis.
 *
 * Motivação: durante o desenvolvimento, um "Não foi possível guardar. Tente
 * novamente." escondeu dois bugs distintos (permissões revogadas e recursão
 * em políticas) durante horas. Uma mensagem genérica poupa o utilizador de
 * jargão, mas também impede quem está a diagnosticar de ver o que se passa.
 *
 * Solução: mensagem clara para as causas conhecidas, e para o resto o código
 * de erro visível ao utilizador (para poder reportar) com o detalhe completo
 * nos registos do servidor.
 */

interface ErroSupabase {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

const MENSAGENS: Record<string, string> = {
  // Violação de restrição única
  '23505': 'Já existe um registo com estes dados.',
  // Chave estrangeira inválida
  '23503': 'Um dos valores selecionados já não existe. Recarregue a página.',
  // Violação de CHECK
  '23514': 'Os dados introduzidos não cumprem as regras de validação.',
  // Não nulo
  '23502': 'Falta preencher um campo obrigatório.',
  // RLS bloqueou a operação
  '42501': 'Não tem permissão para esta operação.',
  // Recursão em políticas — erro de configuração, não do utilizador
  '42P17': 'Erro de configuração da base de dados. A equipa foi notificada.',
  // Linha não encontrada com .single()
  PGRST116: 'O registo não foi encontrado ou já não está disponível.',
  // Violação de política RLS na inserção
  '42P01': 'Recurso indisponível. Contacte o suporte.',
};

export function traduzirErro(erro: ErroSupabase | null | undefined, contexto: string): string {
  if (!erro) return `Não foi possível ${contexto}.`;

  // Detalhe completo nos registos do servidor — nunca no ecrã do utilizador
  console.error(`[${contexto}]`, {
    code: erro.code,
    message: erro.message,
    details: erro.details,
    hint: erro.hint,
  });

  const conhecida = erro.code ? MENSAGENS[erro.code] : undefined;
  if (conhecida) return conhecida;

  // Mensagens que a própria base de dados escreveu para o utilizador
  // (as nossas funções lançam RAISE EXCEPTION com texto em português)
  if (erro.message && /[áàâãéêíóôõúç]/i.test(erro.message) && erro.message.length < 200) {
    return erro.message;
  }

  // Desconhecido: dar um código que o utilizador possa reportar
  const referencia = erro.code ?? 'DESCONHECIDO';
  return `Não foi possível ${contexto}. Se persistir, indique o código ${referencia} ao suporte.`;
}
