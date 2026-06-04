import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const CLUB_CALENDAR_ID =
  'c_2487c0bc3a9c7383b716813d0f8531e5b9d356d83754436bc837acece9b6f1ee@group.calendar.google.com';

export async function GET() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const result = await calendar.events.list({
      calendarId: CLUB_CALENDAR_ID,
      timeMin: oneYearAgo.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events =
      result.data.items?.map((event) => ({
        id: `gcal-${event.id}`,
        name: event.summary || 'Untitled Event',
        event_type: 'GCAL_CLUB',
        date: event.start?.dateTime || event.start?.date || new Date().toISOString(),
        end_date: event.end?.dateTime || event.end?.date || null,
        points: null,
        is_mandatory: null,
        qr_code_secret: null,
        created_at: event.created || new Date().toISOString(),
        location: event.location || null,
        description: event.description || null,
      })) || [];

    return NextResponse.json({ events });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message, events: [] }, { status: 500 });
  }
}