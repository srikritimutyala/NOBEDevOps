import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email || !email.endsWith('@illinois.edu')) {
    return NextResponse.json(
      { error: 'A valid @illinois.edu email is required.' },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const tempPassword = generateTempPassword();
  let authUserId: string | null = null;
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createError) {
    // If the user is already registered in Supabase Auth, update their password so the invite works
    const { data: usersData } = await supabase.auth.admin.listUsers();
    const existingUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase().trim() === email.toLowerCase().trim()
    );

    if (existingUser) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        {
          password: tempPassword,
          email_confirm: true,
        }
      );
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }
      authUserId = existingUser.id;
    } else {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }
  } else {
    authUserId = createData.user.id;
  }

  // Ensure People table row exists and is linked
  if (authUserId) {
    const { data: existingPerson } = await supabase
      .from('People')
      .select('id')
      .or(`auth_id.eq.${authUserId},illinois_email.ilike.${email}`)
      .maybeSingle();

    if (!existingPerson) {
      const { error: insertError } = await supabase.from('People').insert({
        auth_id: authUserId,
        illinois_email: email,
        name: email.split('@')[0],
        role: 'MEMBER',
      });
      if (insertError) {
        await supabase
          .from('People')
          .update({
            illinois_email: email,
            name: email.split('@')[0],
          })
          .eq('auth_id', authUserId);
      }
    } else {
      await supabase
        .from('People')
        .update({
          auth_id: authUserId,
          illinois_email: email,
        })
        .eq('id', existingPerson.id);
    }
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://nobe-dev-ops.vercel.app');
  const loginUrl = `${origin}/users/login`;


  const gasUrl = process.env.GAS_EMAIL_URL;
  const gasSecret = process.env.GAS_EMAIL_SECRET;

  if (!gasUrl || !gasSecret) {
    return NextResponse.json({ success: true, tempPassword, emailError: 'Email service not configured.' });
  }

  const html = `
    <p>You have been invited to create an account on NOBE.</p>
    <p>Log in at <a href="${loginUrl}">${loginUrl}</a> with these credentials:</p>
    <p><strong>Email:</strong> ${email}<br/>
    <strong>Temporary password:</strong> ${tempPassword}</p>
    <p>You will be prompted to set a new password after logging in.</p>
  `;

  const res = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: email, subject: 'You have been invited to NOBE', html, secret: gasSecret }),
  });

  if (!res.ok) {
    return NextResponse.json({ success: true, tempPassword, emailError: 'Failed to send email.' });
  }

  const data = await res.json();
  if (!data.success) {
    return NextResponse.json({ success: true, tempPassword, emailError: data.error || 'Failed to send email.' });
  }

  return NextResponse.json({ success: true });
}
