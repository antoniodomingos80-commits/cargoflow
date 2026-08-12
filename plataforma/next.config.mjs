/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Storage do Supabase (fotografias de carga, documentos, provas de entrega)
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  experimental: {
    serverActions: {
      // Por defeito o limite é 1 MB, o que rejeitava uploads de documentos
      // (BI, carta de condução, licenças) em qualidade normal de foto.
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
