import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/app/utils/supabase/server";

export async function POST(request: Request) {
  try {
    const { absenceId } = await request.json();

    if (!absenceId) {
      return NextResponse.json({ error: "Missing absenceId." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "You must be logged in." }, { status: 401 });
    }

    const { data: absence, error: absenceError } = await supabase
      .from("excused_absences")
      .select("id, user_id, status, reason, admin_response")
      .eq("id", absenceId)
      .single();

    if (absenceError || !absence) {
      return NextResponse.json({ error: "Absence request not found." }, { status: 404 });
    }

    if (!absence.user_id) {
      return NextResponse.json({ error: "No user linked to this absence request." }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(absence.user_id);

    if (authUserError || !authUserData.user?.email) {
      return NextResponse.json({ error: "Could not resolve member email." }, { status: 500 });
    }

    const recipient = authUserData.user.email;
    const emailStatus = absence.status === "APPROVED" ? "approved" : "disapproved";

    const emailBody = [
      `Your absence request has been ${emailStatus}.`,
      "",
      `Reason submitted: ${absence.reason?.trim() || "No reason provided."}`,
      "",
      "Admin response:",
      absence.admin_response,
    ].join("\n");

    const emailResult = await sendEmail({
      to: recipient,
      subject: `Absence request ${emailStatus}`,
      message: emailBody,
    });

    const emailSent = emailResult.ok;
    const emailError = emailResult.ok ? null : emailResult.error || "Failed to send email.";

    await supabase
      .from("excused_absences")
      .update({ email_sent: emailSent, email_error: emailError })
      .eq("id", absenceId);

    return NextResponse.json({ ok: true, emailSent, emailError });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unexpected server error." }, { status: 500 });
  }
}

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured.");
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function sendEmail({ to, subject, message }: { to: string; subject: string; message: string }) {
  const gasUrl = process.env.GAS_EMAIL_URL;
  const gasSecret = process.env.GAS_EMAIL_SECRET;

  if (!gasUrl || !gasSecret) {
    return { ok: false, error: "Email service not configured." };
  }

  const html = `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`;

  const response = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html, secret: gasSecret }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return { ok: false, error: errorBody || "Email send failed." };
  }

  const data = await response.json();
  return data.success ? { ok: true } : { ok: false, error: data.error || "Email send failed." };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
