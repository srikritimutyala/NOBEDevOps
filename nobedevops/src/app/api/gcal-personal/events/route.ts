import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { getGoogleOAuth2Client } from '@/app/utils/google';

export async function GET() {
  try {
    const oauth2Client = await getGoogleOAuth2Client();
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
  } catch (error: any) {
    console.error('Error fetching Google events:', error);
    return NextResponse.json({ error: error.message }, { status: error.message === 'Google Calendar not connected' ? 401 : 500 });
  }
}