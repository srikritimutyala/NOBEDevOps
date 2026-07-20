import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const body = await req.json().catch(() => ({} as { calendarId?: unknown }));
    const requestedCalendarId = typeof body.calendarId === 'string' ? body.calendarId.trim() : undefined;
    const customCalendarId = requestedCalendarId ? (parseCalendarId(requestedCalendarId) || undefined) : undefined;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let query = supabase.from('events').delete();

    if (customCalendarId) {
      query = query.like('gcal_event_id', `imported:public:${customCalendarId}:%`);
      await supabase
        .from('SystemSettings')
        .delete()
        .eq('key', 'club_calendar_id')
        .eq('value', customCalendarId);
    } else {
      query = query.not('gcal_event_id', 'is', null).is('qr_code_secret', null);
      await supabase
        .from('SystemSettings')
        .delete()
        .eq('key', 'club_calendar_id');
    }

    const { error } = await query;

    if (error) {
      console.error('Failed to unsync calendar events:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Calendar unsync error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

