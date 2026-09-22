import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/utils/supabase/admin';
import { isTestAdminEmail } from '@/app/utils/emailValidation';

export async function POST(req: NextRequest) {
  const { auth_id, first_name, last_name, illinois_email } = await req.json();

  if (!auth_id || !first_name || !last_name || !illinois_email) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const normalizedEmail = illinois_email.trim().toLowerCase();
  const defaultRole = isTestAdminEmail(normalizedEmail) ? 'ADMIN' : 'MEMBER';

  const { data: existing } = await supabase
    .from('People')
    .select('id, role')
    .or(`auth_id.eq.${auth_id},illinois_email.ilike.${illinois_email}`)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('People')
      .update({
        auth_id,
        first_name,
        last_name,
        name: `${first_name} ${last_name}`,
        illinois_email,
        role: isTestAdminEmail(normalizedEmail) ? 'ADMIN' : (existing.role || defaultRole),
      })
      .eq('id', existing.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from('People')
      .insert({
        auth_id,
        first_name,
        last_name,
        name: `${first_name} ${last_name}`,
        illinois_email,
        role: defaultRole,
      });

    if (error) {
      // Fallback update in case handle_new_user trigger inserted the row concurrently
      const { error: fallbackError } = await supabase
        .from('People')
        .update({
          first_name,
          last_name,
          name: `${first_name} ${last_name}`,
          illinois_email,
          role: defaultRole,
        })
        .eq('auth_id', auth_id);

      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
