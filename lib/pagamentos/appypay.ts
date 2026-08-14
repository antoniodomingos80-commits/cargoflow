/**
 * Integração com a AppyPay (gateway de pagamentos por referência
 * Multicaixa em Angola — appypay.ao).
 *
 * ⚠️ ATENÇÃO — endpoints por confirmar:
 * Este ficheiro segue o padrão comum destas APIs (OAuth2
 * client_credentials + POST para criar uma referência), com base em
 * documentação pública da AppyPay e de SDKs de terceiros já publicados.
 * NÃO foi testado contra a API real, porque isso exige uma conta
 * AppyPay já aprovada (credenciais client_id/client_secret), que ainda
 * não existem.
 *
 * Antes de ativar em produção, confirmar na documentação da própria
 * conta AppyPay (disponível só depois do registo, em appypay.ao):
 *   1. O URL exato de autenticação (AUTH_URL abaixo é uma suposição)
 *   2. O URL exato de criação de referência (REF_URL abaixo é suposição)
 *   3. Os nomes exatos dos campos no corpo do pedido/resposta
 * e ajustar as constantes/mapeamentos assinalados com "// CONFIRMAR".
 *
 * Enquanto as credenciais não estiverem configuradas, todas as funções
 * aqui devolvem null sem tentar nenhum pedido de rede — o resto do
 * código (gerarReferenciaMulticaixa) já sabe cair para geração local,
 * que é o que a aplicação usa hoje em modo de teste.
 */

const AUTH_URL = process.env.APPYPAY_AUTH_URL || 'https://identity.appypay.co.ao/connect/token'; // CONFIRMAR
const REF_URL = process.env.APPYPAY_REF_URL || 'https://api.appypay.co.ao/v2.0/charges'; // CONFIRMAR

let tokenCache: { valor: string; expiraEm: number } | null = null;

function configurado(): boolean {
  return Boolean(process.env.APPYPAY_CLIENT_ID && process.env.APPYPAY_CLIENT_SECRET);
}

async function obterToken(): Promise<string | null> {
  if (!configurado()) return null;

  if (tokenCache && tokenCache.expiraEm > Date.now()) {
    return tokenCache.valor;
  }

  try {
    const resposta = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.APPYPAY_CLIENT_ID!,
        client_secret: process.env.APPYPAY_CLIENT_SECRET!,
      }),
    });

    if (!resposta.ok) {
      console.error('AppyPay: falha ao autenticar', resposta.status, await resposta.text());
      return null;
    }

    const dados = (await resposta.json()) as { access_token: string; expires_in: number }; // CONFIRMAR nomes dos campos
    tokenCache = {
      valor: dados.access_token,
      expiraEm: Date.now() + (dados.expires_in - 60) * 1000, // renova 60s antes de expirar
    };
    return tokenCache.valor;
  } catch (erro) {
    console.error('AppyPay: erro ao autenticar', erro);
    return null;
  }
}

export type ReferenciaExterna = {
  entidade: string;
  referencia: string;
  idExterno: string;
};

/**
 * Pede à AppyPay uma referência Multicaixa real e válida no sistema
 * bancário — a única forma de a referência funcionar de facto num
 * ATM/app do cliente. Devolve null se a AppyPay não estiver
 * configurada (nesse caso, quem chama esta função deve cair para o
 * comportamento local de geração/teste).
 */
export async function criarReferenciaExterna(
  valor: number,
  referenciaInterna: string,
  descricao: string,
): Promise<ReferenciaExterna | null> {
  if (!configurado()) return null;

  const token = await obterToken();
  if (!token) return null;

  try {
    const resposta = await fetch(REF_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        // CONFIRMAR: nomes exatos dos campos na documentação da conta
        paymentMethod: 'reference',
        amount: valor,
        currency: 'AOA',
        merchantTransactionId: referenciaInterna,
        description: descricao,
      }),
    });

    if (!resposta.ok) {
      console.error('AppyPay: falha ao criar referência', resposta.status, await resposta.text());
      return null;
    }

    const dados = (await resposta.json()) as {
      id: string;
      entity?: string; // CONFIRMAR
      reference?: string; // CONFIRMAR
    };

    if (!dados.entity || !dados.reference) {
      console.error('AppyPay: resposta sem entidade/referência', dados);
      return null;
    }

    return {
      entidade: dados.entity,
      referencia: dados.reference,
      idExterno: dados.id,
    };
  } catch (erro) {
    console.error('AppyPay: erro ao criar referência', erro);
    return null;
  }
}
