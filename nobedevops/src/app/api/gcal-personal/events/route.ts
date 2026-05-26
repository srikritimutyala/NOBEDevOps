import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function GET() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const result = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults: 50,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events =
    result.data.items?.map((event) => ({
      id: `google-${event.id}`,
      name: event.summary || 'Untitled Google event',
      event_type: 'GOOGLE_CALENDAR',
      date: event.start?.dateTime || event.start?.date || new Date().toISOString(),
      points: 0,
      is_mandatory: false,
      location: event.location || 'Google Calendar',
    })) || [];

  return NextResponse.json({ events });
}