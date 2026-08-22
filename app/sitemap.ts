import type { MetadataRoute } from 'next';

function baseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://cargoflow.co.ao').replace(/\/$/, '');
}

export default function sitemap(): MetadataRoute.Sitemap {
  const url = baseUrl();
  const agora = new Date();

  return [
    {
      url: `${url}/`,
      lastModified: agora,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      // Superfície pública do mercado. `changeFrequency: 'daily'` porque as
      // cargas entram e saem da vista todos os dias — a vista só mostra o que
      // está publicado, por atribuir e dentro da janela de recolha.
      //
      // As páginas de detalhe (`/mercado/carga/[id]`) NÃO entram aqui: são
      // dezenas ou centenas, mudam de existência sozinhas quando a carga é
      // atribuída ou expira, e um sitemap cheio de URLs que passam a 404 vale
      // menos do que um sitemap curto e verdadeiro. Chegam-se por ligação a
      // partir desta.
      url: `${url}/mercado`,
      lastModified: agora,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${url}/entrar`,
      lastModified: agora,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${url}/registo`,
      lastModified: agora,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${url}/recuperar`,
      lastModified: agora,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${url}/redefinir`,
      lastModified: agora,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
