import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CLUB_CALENDAR_ID =
  'f4953a68bd3b75e409d7490b65356747c22af1e3fc89b177d6bad1b93a88e097@group.calendar.google.com';

function parseDescription(description: string | null) {
  const nobeTypeMatch = description?.match(/Type:\s*(.+)/);
  const pointsMatch = description?.match(/Points:\s*(\d+)/);
  const dresscodeMatch = description?.match(/Dress Code:\s*(.+)/);
  const mandatoryMatch = description?.match(/Mandatory:\s*Yes/i);

  return {
    event_type: nobeTypeMatch ? nobeTypeMatch[1].trim() : 'GCAL_UNSPECIFIED',
    points: pointsMatch ? parseInt(pointsMatch[1], 10) : 0,
    dresscode: dresscodeMatch ? dresscodeMatch[1].trim() : null,
    is_mandatory: !!mandatoryMatch,
  };
}

export async function POST() {
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

    const gcalItems = result.data.items || [];

    // Use service role key to bypass RLS for server-side sync
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Upsert each GCal event into Supabase
    for (const event of gcalItems) {
      if (!event.id) continue;

      const parsed = parseDescription(event.description || null);

      const { error } = await supabase.from('events').upsert(
        {
          gcal_event_id: event.id,
          name: event.summary || 'Untitled Event',
          event_type: parsed.event_type,
          date: event.start?.dateTime || event.start?.date || new Date().toISOString(),
          location: event.location || null,
          points: parsed.points,
          dresscode: parsed.dresscode,
          is_mandatory: parsed.is_mandatory,
        },
        { onConflict: 'gcal_event_id' }
      );

      if (error) {
        console.error(`Failed to upsert GCal event ${event.id}:`, error.message);
      }
    }

    // Delete Supabase events whose GCal event no longer exists
    const gcalIds = gcalItems.map((e) => e.id).filter(Boolean) as string[];

    const { data: stale } = await supabase
      .from('events')
      .select('id, gcal_event_id')
      .not('gcal_event_id', 'is', null);

    if (stale) {
      const toDelete = stale.filter((e) => !gcalIds.includes(e.gcal_event_id));
      for (const e of toDelete) {
        await supabase.from('events').delete().eq('id', e.id);
      }
    }

    return NextResponse.json({ success: true, synced: gcalItems.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('GCal sync error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
