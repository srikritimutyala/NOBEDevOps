import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuth2Client } from '@/app/utils/google';

export async function POST(req: NextRequest) {
  try {
    const { event } = await req.json();
    const oauth2Client = await getGoogleOAuth2Client();

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const start = new Date(event.date);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.name,
        location: event.location || '',
        description: `NOBE event\nType: ${event.event_type}\nPoints: ${event.points}${event.dresscode ? `\nDress Code: ${event.dresscode}` : ''}`,
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
  } catch (error: any) {
    console.error('Error adding Google event:', error);
    return NextResponse.json({ error: error.message }, { status: error.message === 'Google Calendar not connected' ? 401 : 500 });
  }
}