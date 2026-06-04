import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const { tokens } = await oauth2Client.getToken(code);

  console.log('GOOGLE TOKENS:', tokens);

  if (tokens.refresh_token) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { error } = await supabase
        .from('People')
        .update({ gcal_refresh_token: tokens.refresh_token })
        .eq('auth_id', user.id);
      
      if (error) {
        console.error('Error saving Google refresh token:', error);
      }
    } else {
      console.error('No authenticated user found in callback');
    }
  }

  return NextResponse.redirect(new URL('/users/member', req.url));
}