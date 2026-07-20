import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'email' | 'recovery' | 'invite' | null;
  const next = searchParams.get('next');

  // Don't auto-verify invite/email links on GET — email scanners can pre-fetch links and burn one-time tokens.
  // Redirect to pages that require a real user click before calling verifyOtp.
  if (token_hash && type === 'invite') {
    return NextResponse.redirect(
      `${origin}/auth/setup-account?token_hash=${token_hash}&type=${type}`
    );
  }

  if (token_hash && type === 'email') {
    return NextResponse.redirect(
      `${origin}/auth/confirm-email?token_hash=${token_hash}&type=${type}`
    );
  }

  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "placeholder-key";

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );


  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = next ?? (type === 'recovery' ? '/auth/reset-password' : '/users/login');
      return NextResponse.redirect(`${origin}${destination}`);
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      const destination = next ?? (type === 'recovery' ? '/auth/reset-password' : '/users/login');
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/users/login?error=link_expired`);
}