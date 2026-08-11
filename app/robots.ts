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
