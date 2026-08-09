import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Destino das ligações enviadas por email — confirmação de registo e
 * recuperação de palavra-passe.
 *
 * O Supabase envia a ligação num de dois formatos, consoante o modelo de email
 * do projeto e o fluxo configurado:
 *
 *   · `?code=...`                  → trocar por sessão (PKCE)
 *   · `?token_hash=...&type=...`   → verificar OTP (formato recomendado nos
 *                                    modelos de email atuais)
 *
 * Tratar só um deles faz a ligação falhar sem explicação. Tratamos ambos.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const destino = searchParams.get('destino') ?? '/painel';

  // Erros que o próprio Supabase devolve na ligação (expirada, já usada, …)
  const erroSupabase =
    searchParams.get('error_description') ?? searchParams.get('error');

  if (erroSupabase) {
    return NextResponse.redirect(
      `${origin}/entrar?erro=${encodeURIComponent(erroSupabase)}`,
    );
  }

  const supabase = createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Numa recuperação, o destino é sempre definir a nova palavra-passe
      const paraOnde = type === 'recovery' ? '/redefinir' : destino;
      return NextResponse.redirect(`${origin}${paraOnde}`);
    }
    return NextResponse.redirect(
      `${origin}/entrar?erro=${encodeURIComponent(error.message)}`,
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${destino}`);
    }
    return NextResponse.redirect(
      `${origin}/entrar?erro=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(
    `${origin}/entrar?erro=${encodeURIComponent('Ligação inválida ou incompleta.')}`,
  );
}
