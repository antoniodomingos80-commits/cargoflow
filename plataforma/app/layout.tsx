import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'CargoFlow — A logística inteligente começa aqui',
    template: '%s · CargoFlow',
  },
  description:
    'Plataforma que liga quem tem carga a quem tem camião disponível em Angola. Menos viagens em vazio, rastreamento em tempo real e pagamentos digitais.',
  keywords: [
    'logística Angola', 'transporte de carga', 'camião', 'frete',
    'Luanda', 'Benguela', 'transportadora',
  ],
  authors: [{ name: 'CargoFlow' }],
  openGraph: {
    type: 'website',
    locale: 'pt_AO',
    siteName: 'CargoFlow',
    title: 'CargoFlow — A logística inteligente começa aqui',
    description:
      'Ligamos quem tem carga a quem tem espaço no camião. Menos viagens em vazio, mais rendimento por quilómetro.',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg' }],
  },
  // Estamos a construir; não queremos indexação antes do lançamento.
  // Trocar para index:true quando a plataforma abrir ao público.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0B3C5D',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-AO" className={inter.variable}>
      <body>
        {/* Acessibilidade: saltar navegação (WCAG 2.2) */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-white"
        >
          Saltar para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
