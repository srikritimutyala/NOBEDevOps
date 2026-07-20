import { google } from 'googleapis';
import { createClient } from './supabase/server';

export async function getGoogleOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('User not authenticated');
  }

  const { data: profile, error } = await supabase
    .from('People')
    .select('gcal_refresh_token')
    .eq('auth_id', user.id)
    .single();

  if (error) {
    console.error('Supabase error fetching Google token:', error);
    if (error.code === 'PGRST116') {
      throw new Error('Google Calendar not connected (profile not found)');
    }
    if (error.message.includes('column "gcal_refresh_token" does not exist')) {
      throw new Error('Database schema update required: Please add "gcal_refresh_token" column to "People" table.');
    }
    throw new Error(`Failed to fetch Google token: ${error.message}`);
  }

  if (!profile?.gcal_refresh_token) {
    throw new Error('Google Calendar not connected');
  }

  oauth2Client.setCredentials({
    refresh_token: profile.gcal_refresh_token,
  });

  return oauth2Client;
}
