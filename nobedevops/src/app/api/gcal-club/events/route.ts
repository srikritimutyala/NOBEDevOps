import { google } from 'googleapis';
import { NextResponse } from 'next/server';

const CLUB_CALENDAR_ID =
  'f4953a68bd3b75e409d7490b65356747c22af1e3fc89b177d6bad1b93a88e097@group.calendar.google.com';

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
      result.data.items?.map((event) => {
        const description = event.description || null;
        // Parse event type embedded by the webapp when pushing to GCal
        const nobeTypeMatch = description?.match(/Type:\s*(.+)/);
        const eventType = nobeTypeMatch ? nobeTypeMatch[1].trim() : 'GCAL_UNSPECIFIED';

        return {
          id: `gcal-${event.id}`,
          name: event.summary || 'Untitled Event',
          event_type: eventType,
          date: event.start?.dateTime || event.start?.date || new Date().toISOString(),
          end_date: event.end?.dateTime || event.end?.date || null,
          points: null,
          is_mandatory: null,
          qr_code_secret: null,
          created_at: event.created || new Date().toISOString(),
          location: event.location || null,
          description,
        };
      }) || [];

    return NextResponse.json({ events });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message, events: [] }, { status: 500 });
  }
}