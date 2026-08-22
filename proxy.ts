import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieParaGravar = { name: string; value: string; options: CookieOptions };

/**
 * Middleware de sessão e proteção de rotas.
 *
 * Duas responsabilidades:
 *  1. Renovar o token de sessão do Supabase a cada pedido (os Server
 *     Components não conseguem escrever cookies, por isso tem de ser aqui).
 *  2. Impedir acesso a rotas privadas sem sessão, e redirecionar quem já tem
 *     sessão para fora das páginas de autenticação.
 *
 * A autorização fina (que perfil vê o quê) fica nas próprias páginas e,
 * sobretudo, nas políticas RLS da base de dados — defesa em profundidade.
 */

// `/redefinir` é pública de propósito: quem lá chega pode ter a sessão temporária
// da ligação de email, mas se ela tiver expirado é a própria página que explica
// o que aconteceu — melhor do que um salto silencioso para o login.
const ROTAS_PUBLICAS = ['/', '/entrar', '/registo', '/recuperar', '/redefinir', '/auth',
  // Detalhe público de uma carga. O prefixo é `/mercado/carga/` no singular, e
  // por isso NÃO apanha `/mercado/cargas`, que é a lista autenticada.
  '/mercado/carga'];

// Rotas públicas que só valem no caminho exacto.
//
// `/mercado` tem de estar aqui e não na lista acima: o teste de cima também
// aceita prefixos, e `/mercado` como prefixo tornaria `/mercado/cargas` e
// `/mercado/viagens` públicas — que são a área autenticada. O singular
// `/mercado/carga` não tem esse problema; o `/mercado` sozinho tem.
const ROTAS_PUBLICAS_EXACTAS = ['/mercado'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieParaGravar[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: getUser() valida o token no servidor Supabase.
  // Não usar getSession(), que confia no cookie sem verificar.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const ehPublica =
    ROTAS_PUBLICAS_EXACTAS.includes(pathname) ||
    ROTAS_PUBLICAS.some(
      (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
    );

  // Sem sessão numa rota privada → enviar para o login, guardando o destino
  if (!user && !ehPublica) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.searchParams.set('destino', pathname);
    return NextResponse.redirect(url);
  }

  // Com sessão nas páginas de autenticação → enviar para a aplicação
  if (user && (pathname === '/entrar' || pathname === '/registo')) {
    const url = request.nextUrl.clone();
    url.pathname = '/painel';
    url.searchParams.delete('destino');
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Tudo exceto ficheiros estáticos, imagens e os ficheiros que os
    // rastreadores vão buscar.
    //
    // `sitemap.xml` e `robots.txt` estavam a passar pelo middleware e, por não
    // constarem das rotas públicas, respondiam 307 para `/entrar`. Um sitemap
    // que redirecciona para o login não é lido por rastreador nenhum — o que
    // tornava inútil qualquer entrada lá dentro. Medido com `curl` ao arrancar
    // a superfície pública do mercado.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sitemap.xml|robots.txt|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
