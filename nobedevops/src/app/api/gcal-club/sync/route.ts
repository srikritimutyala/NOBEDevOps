import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
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

function parseCalendarId(value: string | null) {
  if (!value) return null;
  let cleaned = value.trim();
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Ignore decode errors and use raw value.
  }

  const tryBase64 = (candidate: string) => {
    try {
      const decoded = Buffer.from(candidate, 'base64').toString('utf8');
      return decoded.includes('@') ? decoded : null;
    } catch {
      return null;
    }
  };

  const srcMatch = cleaned.match(/[?&](?:src|cid)=([^&]+)/);
  if (srcMatch?.[1]) {
    const extracted = decodeURIComponent(srcMatch[1]);
    if (extracted.includes('@')) {
      return extracted;
    }
    return tryBase64(extracted) || extracted;
  }

  const icalMatch = cleaned.match(/\/ical\/([^\/]+)\//);
  if (icalMatch?.[1]) {
    const extracted = decodeURIComponent(icalMatch[1]);
    if (extracted.includes('@')) {
      return extracted;
    }
    return tryBase64(extracted) || extracted;
  }

  if (cleaned.includes('@') || cleaned.includes('%40')) {
    return cleaned;
  }

  return tryBase64(cleaned);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const body = await req.json().catch(() => ({} as { calendarId?: unknown }));
    const requestedCalendarId = typeof body.calendarId === 'string' ? body.calendarId.trim() : undefined;
    const customCalendarId = requestedCalendarId ? (parseCalendarId(requestedCalendarId) || undefined) : undefined;

    let finalCalendarId = customCalendarId;
    if (!requestedCalendarId) {
      const { data: dbSettings } = await supabase
        .from('SystemSettings')
        .select('value')
        .eq('key', 'club_calendar_id')
        .maybeSingle();
      if (dbSettings?.value) {
        finalCalendarId = dbSettings.value;
      }
    }

    const calendarId = requestedCalendarId && !customCalendarId ? undefined : finalCalendarId || CLUB_CALENDAR_ID;
    const isCustomCalendar = Boolean(finalCalendarId);

    if (requestedCalendarId && !calendarId) {
      throw new Error('Invalid public calendar link or ID. Use a public Google Calendar link or calendar address.');
    }

    if (isCustomCalendar && !process.env.GOOGLE_API_KEY) {
      throw new Error('Missing GOOGLE_API_KEY for public calendar sync.');
    }

    const calendar = google.calendar({
      version: 'v3',
      auth: isCustomCalendar
        ? process.env.GOOGLE_API_KEY
        : (() => {
            const oauth2Client = new google.auth.OAuth2(
              process.env.GOOGLE_CLIENT_ID,
              process.env.GOOGLE_CLIENT_SECRET,
              process.env.GOOGLE_REDIRECT_URI
            );

            oauth2Client.setCredentials({
              refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
            });

            return oauth2Client;
          })(),
    });

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const result = await calendar.events.list({
      calendarId,
      timeMin: oneYearAgo.toISOString(),
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    });

    if (isCustomCalendar && customCalendarId) {
      await supabase
        .from('SystemSettings')
        .upsert({ key: 'club_calendar_id', value: customCalendarId });
    }

    const gcalItems = result.data.items || [];

    for (const event of gcalItems) {
      if (!event.id) continue;

      const parsed = parseDescription(event.description || null);
      const gcalEventId = isCustomCalendar
        ? `imported:public:${calendarId}:${event.id}`
        : `imported:club:${event.id}`;

      const { error } = await supabase.from('events').upsert(
        {
          gcal_event_id: gcalEventId,
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

    const gcalIds = gcalItems.map((e) => e.id).filter(Boolean) as string[];

    const prefix = isCustomCalendar
      ? `imported:public:${calendarId}:%`
      : `imported:club:%`;

    const { data: stale } = await supabase
      .from('events')
      .select('id, gcal_event_id')
      .like('gcal_event_id', prefix);

    if (stale) {
      const toDelete = stale.filter((e) => {
        const rawId = e.gcal_event_id?.replace(/^imported:(?:club|public):(?:[^:]+:)?/, '');
        return rawId ? !gcalIds.includes(rawId) : !gcalIds.includes(e.gcal_event_id ?? '');
      });
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
