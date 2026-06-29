import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await supabase
      .from('events')
      .delete()
      .not('gcal_event_id', 'is', null)
      .is('qr_code_secret', null);

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
