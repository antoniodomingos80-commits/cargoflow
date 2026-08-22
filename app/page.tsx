import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import {
  Package, Truck, MapPin, ShieldCheck, Zap, BarChart3, ArrowRight,
} from 'lucide-react';

const COMO_FUNCIONA = [
  {
    icone: Package,
    titulo: 'Publique a carga',
    texto: 'Origem, destino, peso e datas. Leva menos de um minuto.',
  },
  {
    icone: Zap,
    titulo: 'O sistema encontra o camião',
    texto: 'A correspondência é automática — não precisa de telefonar a ninguém.',
  },
  {
    icone: MapPin,
    titulo: 'Acompanhe até à entrega',
    texto: 'Localização em tempo real e prova de entrega com fotografia.',
  },
];

const BENEFICIOS = [
  {
    icone: Truck,
    titulo: 'Menos viagens em vazio',
    texto:
      'O camião que descarrega em Luanda encontra carga de retorno para Benguela. Cada quilómetro passa a render.',
  },
  {
    icone: ShieldCheck,
    titulo: 'Confiança verificada',
    texto:
      'Identidade validada, documentos aprovados e avaliações públicas. Sabe com quem está a trabalhar.',
  },
  {
    icone: BarChart3,
    titulo: 'Decisões com dados',
    texto:
      'Histórico de preços por corredor, tempos médios e desempenho da frota — no lugar de intuição.',
  },
];

export default function PaginaInicial() {
  return (
    <div className="min-h-screen bg-white">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-3">
            <Link href="/entrar">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link href="/registo">
              <Button size="sm">Criar conta</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        {/* Herói */}
        <section className="relative overflow-hidden bg-navy-600 py-24 text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="container relative max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-brand-200">
              Angola · Corredor Luanda–Benguela–Huambo
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
              A logística inteligente
              <br />
              <span className="text-brand-400">começa aqui.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-navy-100">
              Metade dos camiões viaja vazio porque não há forma de saber que
              carga existe no sentido inverso. A CargoFlow resolve isso.
            </p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/registo">
                <Button size="lg" className="w-full sm:w-auto">
                  Começar agora
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
              {/* Deixa ver o produto antes de pedir a conta: a página é pública
                  e mostra rota, tipo, peso e janela — sem valores nem contactos. */}
              <Link href="/mercado">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full border-white/25 bg-transparent text-white hover:bg-white/10 sm:w-auto"
                >
                  Ver cargas disponíveis
                </Button>
              </Link>
              <Link href="#como-funciona">
                <Button
                  size="lg"
                  variant="ghost"
                  className="w-full text-white hover:bg-white/10 sm:w-auto"
                >
                  Como funciona
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="py-24">
          <div className="container">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold text-navy-600">
                Três passos, sem telefonemas
              </h2>
              <p className="mt-3 text-slate-600">
                Do anúncio da carga à prova de entrega, tudo num só sítio.
              </p>
            </div>

            <ol className="mt-14 grid gap-8 md:grid-cols-3">
              {COMO_FUNCIONA.map(({ icone: Icone, titulo, texto }, i) => (
                <li key={titulo} className="relative">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
                    <Icone className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Passo {i + 1}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-navy-600">{titulo}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Benefícios */}
        <section className="border-y border-slate-100 bg-slate-50 py-24">
          <div className="container grid gap-8 md:grid-cols-3">
            {BENEFICIOS.map(({ icone: Icone, titulo, texto }) => (
              <div key={titulo} className="cf-card p-7">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-600 text-white">
                  <Icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-bold text-navy-600">{titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Chamada final */}
        <section className="py-24">
          <div className="container max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-navy-600">
              Comerciante ou camionista, comece hoje
            </h2>
            <p className="mt-3 text-slate-600">
              Criar conta é gratuito. Só paga quando um transporte se concretiza.
            </p>
            <Link href="/registo" className="mt-8 inline-block">
              <Button size="lg">
                Criar conta gratuita
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo />
          <p className="text-xs text-slate-500">
            © {new Date().getFullYear()} CargoFlow · Benguela, Angola
          </p>
        </div>
      </footer>
    </div>
  );
}
