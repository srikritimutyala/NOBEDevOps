import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { event } = await req.json();

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json(
      { error: 'Google Calendar is not connected.' },
      { status: 401 }
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const start = new Date(event.date);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const result = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: event.name,
      location: event.location || '',
      description: `NOBE event\nType: ${event.event_type}\nPoints: ${event.points}`,
      start: {
        dateTime: start.toISOString(),
      },
      end: {
        dateTime: end.toISOString(),
      },
    },
  });

  return NextResponse.json({
    success: true,
    googleEventId: result.data.id,
  });
}