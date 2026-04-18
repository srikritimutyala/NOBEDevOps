import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/app/utils/supabase/server";

type ReviewPayload = {
  absenceId?: string;
  status?: string;
  responseMessage?: string;
};

type ReviewResult = {
  id: string;
  status: string | null;
  admin_response: string | null;
  reviewed_at: string | null;
  email_sent: boolean | null;
  email_error: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReviewPayload;
    const absenceId = body.absenceId?.trim();
    const status = body.status?.trim().toUpperCase();
    const responseMessage = body.responseMessage?.trim();

    if (!absenceId || !status || !responseMessage) {
      return NextResponse.json(
        { error: "Missing required fields: absenceId, status, responseMessage." },
        { status: 400 }
      );
    }

    if (status !== "APPROVED" && status !== "DENIED") {
      return NextResponse.json(
        { error: "Status must be APPROVED or DENIED." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to review absence requests." },
        { status: 401 }
      );
    }

    const { data: absence, error: absenceError } = await supabase
      .from("excused_absences")
      .select("id, user_id, reason, status")
      .eq("id", absenceId)
      .single();

    if (absenceError || !absence) {
      return NextResponse.json(
        { error: "Absence request not found." },
        { status: 404 }
      );
    }

    if (!absence.user_id) {
      return NextResponse.json(
        { error: "This absence request is not linked to a user account." },
        { status: 400 }
      );
    }

    const emailStatus = status === "APPROVED" ? "approved" : "disapproved";
    let emailSent = false;
    let emailError: string | null = null;
    let reviewRecipient: string | null = null;

    try {
      const adminClient = createAdminClient();
      const { data: authUserData, error: authUserError } =
        await adminClient.auth.admin.getUserById(absence.user_id);

      if (authUserError || !authUserData.user?.email) {
        emailError = "The member email could not be resolved from Supabase Auth.";
      } else {
        reviewRecipient = authUserData.user.email;
      }
    } catch (error: any) {
      emailError = error?.message || "Supabase admin credentials are not configured.";
    }

    if (reviewRecipient) {
      const emailBody = [
        `Your absence request has been ${emailStatus}.`,
        "",
        `Reason submitted: ${absence.reason?.trim() || "No reason provided."}`,
        "",
        "Admin response:",
        responseMessage,
      ].join("\n");

      const emailResult = await sendEmail({
        to: reviewRecipient,
        subject: `Absence request ${emailStatus}`,
        message: emailBody,
      });

      emailSent = emailResult.ok;
      emailError = emailResult.ok ? null : emailResult.error || "Failed to send review email.";
    }

    const reviewedAt = new Date().toISOString();
    const { data: updatedReview, error: updateError } = await supabase
      .from("excused_absences")
      .update({
        status,
        admin_response: responseMessage,
        reviewed_at: reviewedAt,
        email_sent: emailSent,
        email_error: emailError,
      })
      .eq("id", absenceId)
      .select("id, status, admin_response, reviewed_at, email_sent, email_error")
      .single();

    if (updateError || !updatedReview) {
      return NextResponse.json(
        { error: updateError?.message || "Failed to save review." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      emailSent,
      emailError,
      review: updatedReview as ReviewResult,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
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

async function sendEmail({
  to,
  subject,
  message,
}: {
  to: string;
  subject: string;
  message: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    return { ok: false, error: "Email service not configured." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: "onboarding@resend.dev",
      to,
      subject,
      html: `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return { ok: false, error: errorBody || "Email send failed." };
  }

  return { ok: true };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
