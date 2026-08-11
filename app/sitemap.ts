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
