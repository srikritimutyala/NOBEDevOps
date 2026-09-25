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
      .select("id, user_id, event_id, reason, status")
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

    const adminClient = createAdminClient();

    let eventData: {
      id: string;
      name: string | null;
      points: number | null;
      event_type: string | null;
      is_mandatory: boolean | null;
    } | null = null;

    if (absence.event_id) {
      const { data } = await adminClient
        .from("events")
        .select("id, name, points, event_type, is_mandatory")
        .eq("id", absence.event_id)
        .maybeSingle();
      eventData = data;
    }

    // If APPROVED, mark them as present by adding an attendance record and awarding points
    if (status === "APPROVED" && absence.event_id) {
      const { data: existingAttendance } = await adminClient
        .from("attendance")
        .select("id")
        .eq("user_id", absence.user_id)
        .eq("event_id", absence.event_id)
        .maybeSingle();

      const eventPoints = eventData?.points ?? 0;
      const eventType = eventData?.event_type ?? null;

      if (!existingAttendance) {
        const { error: insertError } = await adminClient
          .from("attendance")
          .insert({
            user_id: absence.user_id,
            event_id: absence.event_id,
            timestamp: new Date().toISOString(),
            points_awarded: eventPoints,
            point_type: eventType,
          });

        if (insertError) {
          console.error("Failed to insert attendance record for approved absence:", insertError);
        }

        // Award points to the member profile if the event has points
        if (eventPoints > 0 && eventType) {
          const { data: profile } = await adminClient
            .from("People")
            .select("professional_points, service_points, social_points")
            .eq("auth_id", absence.user_id)
            .maybeSingle();

          if (profile) {
            const updates: Record<string, number> = {};
            const normType = eventType.toUpperCase();

            if (normType.includes("PROF")) {
              updates.professional_points = (profile.professional_points ?? 0) + eventPoints;
            } else if (normType.includes("SERV")) {
              updates.service_points = (profile.service_points ?? 0) + eventPoints;
            } else if (normType.includes("SOCI")) {
              updates.social_points = (profile.social_points ?? 0) + eventPoints;
            }

            if (Object.keys(updates).length > 0) {
              await adminClient
                .from("People")
                .update(updates)
                .eq("auth_id", absence.user_id);
            }
          }
        }
      }

      // If a strike was generated for this missed mandatory event, remove it and decrement People.strikes
      const { data: existingStrikes } = await adminClient
        .from("strikes")
        .select("id")
        .eq("user_id", absence.user_id)
        .eq("event_id", absence.event_id)
        .eq("status", "ACTIVE");

      if (existingStrikes && existingStrikes.length > 0) {
        await adminClient
          .from("strikes")
          .delete()
          .eq("user_id", absence.user_id)
          .eq("event_id", absence.event_id);

        const { data: person } = await adminClient
          .from("People")
          .select("strikes")
          .eq("auth_id", absence.user_id)
          .maybeSingle();

        if (person && typeof person.strikes === "number" && person.strikes > 0) {
          await adminClient
            .from("People")
            .update({ strikes: Math.max(0, person.strikes - existingStrikes.length) })
            .eq("auth_id", absence.user_id);
        }
      }
    } else if (status === "DENIED" && absence.status?.toUpperCase() === "APPROVED" && absence.event_id) {
      // If previously approved and now disapproved, reverse the attendance and points awarded
      const { data: existingAttendance } = await adminClient
        .from("attendance")
        .select("id, points_awarded, point_type")
        .eq("user_id", absence.user_id)
        .eq("event_id", absence.event_id)
        .maybeSingle();

      if (existingAttendance) {
        await adminClient
          .from("attendance")
          .delete()
          .eq("id", existingAttendance.id);

        const pointsToDeduct = existingAttendance.points_awarded ?? (eventData?.points ?? 0);
        const eventType = existingAttendance.point_type ?? eventData?.event_type;

        if (pointsToDeduct > 0 && eventType) {
          const { data: profile } = await adminClient
            .from("People")
            .select("professional_points, service_points, social_points")
            .eq("auth_id", absence.user_id)
            .maybeSingle();

          if (profile) {
            const updates: Record<string, number> = {};
            const normType = eventType.toUpperCase();

            if (normType.includes("PROF")) {
              updates.professional_points = Math.max(0, (profile.professional_points ?? 0) - pointsToDeduct);
            } else if (normType.includes("SERV")) {
              updates.service_points = Math.max(0, (profile.service_points ?? 0) - pointsToDeduct);
            } else if (normType.includes("SOCI")) {
              updates.social_points = Math.max(0, (profile.social_points ?? 0) - pointsToDeduct);
            }

            if (Object.keys(updates).length > 0) {
              await adminClient
                .from("People")
                .update(updates)
                .eq("auth_id", absence.user_id);
            }
          }
        }
      }
    }

    const emailStatus = status === "APPROVED" ? "approved" : "disapproved";
    let emailSent = false;
    let emailError: string | null = null;
    let reviewRecipient: string | null = null;

    try {
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

    const eventName = eventData?.name ?? null;
    const isMandatory = eventData?.is_mandatory ?? false;
    const eventSuffix = eventName ? ` for "${eventName}" (${isMandatory ? "Mandatory" : "Optional"})` : "";

    if (reviewRecipient) {
      const emailBody = [
        `Your absence request${eventSuffix} has been ${emailStatus}.`,
        "",
        `Reason submitted: ${absence.reason?.trim() || "No reason provided."}`,
        "",
        "Admin response:",
        responseMessage,
      ].join("\n");

      const emailResult = await sendEmail({
        to: reviewRecipient,
        subject: `Absence request ${emailStatus}${eventName ? ` - ${eventName}` : ""}`,
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

