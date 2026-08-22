import type { MetadataRoute } from 'next';

function baseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://cargoflow.co.ao').replace(/\/$/, '');
}

export default function robots(): MetadataRoute.Robots {
  const url = baseUrl();
  const host = new URL(url).host;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/cargas',
          '/configuracoes',
          '/documentos',
          '/frota',
          '/mensagens',
          // `/mercado` é público e fica de fora desta lista de propósito. As
          // duas abaixo são autenticadas: sem isto, um rastreador que chegue a
          // `/mercado` segue para elas e só encontra o redireccionamento para
          // o login. O prefixo `/mercado/cargas` não apanha `/mercado/carga/`,
          // que é o detalhe público — o singular salva-o.
          '/mercado/cargas',
          '/mercado/viagens',
          '/pagamentos',
          '/painel',
          '/rastreio',
          '/relatorios',
          '/viagens',
        ],
      },
    ],
    sitemap: `${url}/sitemap.xml`,
    host,
  };
}
