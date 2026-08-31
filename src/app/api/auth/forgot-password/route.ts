import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/app/utils/supabase/admin';
import { sendEmail } from '@/app/utils/sendEmail';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email address is required.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const supabaseAdmin = createAdminClient();

    // 1. Find the user's name if they exist in People table
    const { data: person } = await supabaseAdmin
      .from('People')
      .select('first_name, name')
      .ilike('illinois_email', normalizedEmail)
      .maybeSingle();

    const firstName = person?.first_name || (person?.name ? person.name.split(' ')[0] : null) || 'there';

    // 2. Determine origin (defaults to public production domain)
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      'https://nobe-dev-ops.vercel.app';

    // 3. Generate password recovery link from Supabase Auth Admin
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: {
        redirectTo: `${origin}/auth/reset-password`,
      },
    });

    if (linkError || !linkData?.properties) {
      // If user is not found in auth, for security return a generic success message
      console.warn('generateLink error or user not found:', linkError?.message);
      return NextResponse.json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been sent.',
      });
    }

    const tokenHash = linkData.properties.hashed_token;
    const resetUrl = tokenHash
      ? `${origin}/auth/reset-password?token_hash=${tokenHash}&type=recovery`
      : linkData.properties.action_link;

    // 4. Construct custom NOBE email
    const subject = 'Reset your NOBE Illinois Attendance Portal password';
    const plainTextMessage = `Hi ${firstName},\n\nLooks like you forgot your password for the NOBE Attendance Portal (${normalizedEmail}).\n\nClick the link below to choose a new password:\n${resetUrl}\n\nThis link is valid for 1 hour. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.\n\n— NOBE Illinois Team`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your NOBE password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f7f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #4f5052;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f7f7f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 24px; border: 1px solid rgba(79, 80, 82, 0.14); box-shadow: 0 8px 30px rgba(0,0,0,0.06); overflow: hidden; padding: 36px 32px; text-align: left;">
          <tr>
            <td style="padding-bottom: 24px; text-align: center;">
              <h2 style="margin: 0; color: #e58a27; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em;">
                NOBE Illinois
              </h2>
              <p style="margin: 4px 0 0; font-size: 0.85rem; color: #6b6c70; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;">
                Attendance Portal
              </p>
            </td>
          </tr>
          <tr>
            <td>
              <h1 style="margin: 0 0 16px; font-size: 1.45rem; font-weight: 750; color: #1c1d1f;">
                Forgot your password?
              </h1>
              <p style="margin: 0 0 16px; font-size: 1rem; line-height: 1.5; color: #4f5052;">
                Hi <strong>${firstName}</strong>,
              </p>
              <p style="margin: 0 0 24px; font-size: 0.95rem; line-height: 1.6; color: #4f5052;">
                Looks like you requested a password reset for your account on the <strong>NOBE Attendance Portal</strong> (<code style="background-color: #f3f3f2; padding: 2px 6px; border-radius: 4px; font-size: 0.9em;">${normalizedEmail}</code>).
              </p>
              <p style="margin: 0 0 24px; font-size: 0.95rem; line-height: 1.6; color: #4f5052;">
                Click the button below to choose a new password:
              </p>
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="${resetUrl}" style="background-color: #e58a27; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 1rem; display: inline-block; box-shadow: 0 4px 14px rgba(229, 138, 39, 0.35);">
                  Reset My Password
                </a>
              </div>

              <p style="margin: 24px 0 8px; font-size: 0.85rem; line-height: 1.5; color: #6b6c70;">
                If the button above doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0 0 24px; font-size: 0.82rem; line-height: 1.4; word-break: break-all;">
                <a href="${resetUrl}" style="color: #e58a27; text-decoration: underline;">
                  ${resetUrl}
                </a>
              </p>

              <hr style="border: none; border-top: 1px solid rgba(79, 80, 82, 0.12); margin: 24px 0;" />

              <p style="margin: 0 0 8px; font-size: 0.82rem; line-height: 1.5; color: #8a8b8e;">
                This link is valid for 1 hour. If you didn't request a password reset, you can safely ignore this email — your account remains completely secure.
              </p>
              <p style="margin: 16px 0 0; font-size: 0.85rem; color: #6b6c70; font-weight: 600;">
                — NOBE Illinois Team
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    // 5. Send the customized email
    try {
      await sendEmail(normalizedEmail, subject, plainTextMessage, htmlContent);
    } catch (emailErr: any) {
      console.warn('sendEmail via GAS failed, falling back to Supabase client email:', emailErr.message);
      // Fallback: If GAS email is not configured in local development, use Supabase default email sender
      const { error: resetErr } = await supabaseAdmin.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${origin}/auth/reset-password`,
      });
      if (resetErr) {
        console.error('Supabase fallback resetPasswordForEmail also failed:', resetErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Check your email for a password reset link.',
    });
  } catch (err: any) {
    console.error('Forgot password API error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to process password reset request.' },
      { status: 500 }
    );
  }
}
