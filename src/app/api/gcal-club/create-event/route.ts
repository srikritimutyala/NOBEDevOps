import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';

const CLUB_CALENDAR_ID =
  'f4953a68bd3b75e409d7490b65356747c22af1e3fc89b177d6bad1b93a88e097@group.calendar.google.com';

export async function POST(req: NextRequest) {
  try {
    const { event } = await req.json();

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
    const end = event.end_date ? new Date(event.end_date) : new Date(start.getTime() + 60 * 60 * 1000);

    // Embed the NOBE event type in the description so it can be parsed on import
    const descriptionLines = [
      `Type: ${event.event_type}`,
      `Points: ${event.points}`,
      event.dresscode ? `Dress Code: ${event.dresscode}` : null,
      event.is_mandatory ? 'Mandatory: Yes' : null,
    ].filter(Boolean);

    const result = await calendar.events.insert({
      calendarId: CLUB_CALENDAR_ID,
      requestBody: {
        summary: event.name,
        location: event.location || '',
        description: descriptionLines.join('\n'),
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });

    return NextResponse.json({ success: true, googleEventId: result.data.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error creating GCal club event:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
