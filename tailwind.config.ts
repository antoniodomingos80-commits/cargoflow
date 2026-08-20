import type { Config } from 'tailwindcss';

// Paleta oficial CargoFlow (ver manual de marca):
//   #0B3C5D  navy      — texto principal, superfícies escuras
//   #1E88E5  azul      — ação primária, links, estados ativos
//   #FF8C42  laranja   — alertas, atrasos, destaque secundário
const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Cores semânticas ligadas às variáveis CSS em globals.css.
        // Sem estas, classes como `border-border` ou `bg-background` não
        // existem e o Tailwind falha na compilação.
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',

        navy: {
          50: '#E7EDF2',
          100: '#C3D2DE',
          200: '#9BB4C8',
          300: '#7396B2',
          400: '#4F7B9C',
          500: '#2C6186',
          600: '#0B3C5D', // principal
          700: '#093249',
          800: '#062436',
          900: '#041924',
        },
        brand: {
          50: '#E8F2FD',
          100: '#C5DEFA',
          200: '#9EC8F6',
          300: '#76B2F2',
          400: '#4C9DEE',
          500: '#1E88E5', // principal
          600: '#1A73C7',
          700: '#155DA1',
          800: '#11477B',
          900: '#0C3155',
        },
        accent: {
          50: '#FFF3E9',
          100: '#FFE0C7',
          200: '#FFCBA2',
          300: '#FFB57C',
          400: '#FFA05F',
          500: '#FF8C42', // principal
          600: '#E5762F',
          700: '#BF5F22',
          800: '#994A18',
          900: '#73360F',
        },
        // Estados semânticos usados em cargas, viagens e alertas
        status: {
          transit: '#1E88E5',
          delayed: '#FF8C42',
          done: '#16A34A',
          idle: '#94A3B8',
          danger: '#DC2626',
        },
      },
      // 4.5 (18px) é usado em todo o projecto para ícones (`h-4.5 w-4.5`),
      // mas não existe na escala por omissão do Tailwind — as classes eram
      // silenciosamente ignoradas e os ícones ficavam nos 24px do lucide.
      spacing: {
        '4.5': '1.125rem',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,60,93,.06), 0 4px 16px rgba(11,60,93,.06)',
        'card-hover': '0 2px 4px rgba(11,60,93,.08), 0 12px 28px rgba(11,60,93,.10)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        // Gaveta de navegação em ecrã pequeno.
        'slide-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out',
        shimmer: 'shimmer 1.6s infinite',
        'slide-in': 'slide-in .2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
