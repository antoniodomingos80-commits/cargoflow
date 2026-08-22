import Link from 'next/link';
import { Logo } from '@/components/logo';
import { classesBotao } from '@/components/ui/button';

/**
 * Camada de rotas PÚBLICAS.
 *
 * Existe porque o grupo `(app)` redirecciona para `/entrar` quando não há
 * perfil — é essa a barreira que protege a área privada, e não se toca nela.
 * Uma página pública não pode viver lá dentro.
 *
 * Este grupo NÃO chama `getSessionProfile()` nem lê cookies de sessão. Um
 * visitante sem conta tem de conseguir abrir estas páginas, e qualquer leitura
 * de sessão aqui traria de volta a dependência que se está a evitar.
 *
 * O cabeçalho é deliberadamente mínimo — logótipo, entrar, registar. Não repete
 * a navegação da aplicação: essa é por perfil e não faz sentido a quem ainda não
 * tem um.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="CargoFlow — início">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-3">
            <Link
              href="/mercado"
              className="rounded-lg px-3 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-navy-50"
            >
              Cargas
            </Link>
            <Link
              href="/entrar"
              className="rounded-lg px-3 py-2 text-sm font-medium text-navy-600 transition-colors hover:bg-navy-50"
            >
              Entrar
            </Link>
            <Link href="/registo" className={classesBotao({ size: 'sm' })}>
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main id="conteudo" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <p>
            CargoFlow — a logística inteligente começa aqui. As cargas listadas
            publicamente mostram apenas informação operacional. Valores, contactos
            e dados das empresas exigem sessão iniciada.
          </p>
        </div>
      </footer>
    </div>
  );
}
