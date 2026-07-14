import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/utils/supabase/admin';

export async function POST(req: NextRequest) {
  const { auth_id, first_name, last_name, illinois_email } = await req.json();

  if (!auth_id || !first_name || !last_name || !illinois_email) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('People')
    .update({
      first_name,
      last_name,
      name: `${first_name} ${last_name}`,
      illinois_email,
    })
    .eq('auth_id', auth_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
