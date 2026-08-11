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
const ROTAS_PUBLICAS = ['/', '/entrar', '/registo', '/recuperar', '/redefinir', '/auth'];

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
  const ehPublica = ROTAS_PUBLICAS.some(
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
    // Tudo exceto ficheiros estáticos e imagens
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
