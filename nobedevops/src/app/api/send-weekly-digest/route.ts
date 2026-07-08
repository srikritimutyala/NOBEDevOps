import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/utils/supabase/admin";
import { sendEmail } from "@/app/utils/sendEmail";
import { getPointRequirements } from "@/app/utils/getPointRequirements";

function formatEventLine(e: any) {
  const start = new Date(e.date);
  const when = start.toLocaleString("en-US", {
    weekday: "long",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });

  const lines = [
    `${e.name}${e.points ? ` (${e.points} point${e.points === 1 ? "" : "s"})` : ""}${e.is_mandatory ? " [MANDATORY]" : ""}`,
    `  When: ${when}`,
  ];
  if (e.location) lines.push(`  Where: ${e.location}`);
  if (e.dresscode) lines.push(`  Dress Code: ${e.dresscode}`);
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testEmailParam = searchParams.get("testEmail");
    const testEmails = testEmailParam
      ? testEmailParam.split(",").map((e) => e.trim()).filter(Boolean)
      : null;
    const dryRun = searchParams.get("dryRun") === "true";

    const supabaseAdmin = createAdminClient();
    const goals = await getPointRequirements();

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: events, error: eventsError } = await supabaseAdmin
      .from("events")
      .select("name, event_type, date, points, is_mandatory, location, dresscode")
      .gte("date", now.toISOString())
      .lt("date", weekFromNow.toISOString())
      .order("date", { ascending: true });
    if (eventsError) throw eventsError;

    const { data: noteRow, error: noteError } = await supabaseAdmin
      .from("weekly_reminder_note")
      .select("text")
      .eq("id", 1)
      .single();
    if (noteError) throw noteError;
    const reminderText = (noteRow?.text ?? "").trim();

    const categoryOrder = ["PROFESSIONAL", "SOCIAL", "SERVICE", "GENERAL_MEETING", "NEW_MEMBER_WORKSHOP", "PROJECT_MEETING", "OTHER_MANDATORY"];
    const eventsByType: Record<string, any[]> = {};
    for (const type of categoryOrder) eventsByType[type] = [];
    for (const e of events ?? []) {
      if (!eventsByType[e.event_type]) eventsByType[e.event_type] = [];
      eventsByType[e.event_type].push(e);
    }

    const eventSections: string[] = [];
    for (const type of categoryOrder) {
      const typeEvents = eventsByType[type];
      if (!typeEvents || typeEvents.length === 0) continue;
      const label = type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      eventSections.push(`${label}:\n\n${typeEvents.map(formatEventLine).join("\n\n")}`);
    }

    // Fallback is based purely on whether there are events — reminders are separate.
    let eventsBlock = eventSections.length > 0
      ? eventSections.join("\n\n")
      : "No events scheduled this week.";

    if (reminderText) {
      eventsBlock += `\n\nAdditional Reminders:\n\n${reminderText}`;
    }

    let recipients: { illinois_email: string; first_name: string; professional_points: number; service_points: number; social_points: number }[] = [];

    if (testEmails) {
      const { data: matched } = await supabaseAdmin
        .from("People")
        .select("illinois_email, first_name, professional_points, service_points, social_points")
        .in("illinois_email", testEmails);

      recipients = testEmails.map((email) => {
        const match = matched?.find((m) => m.illinois_email === email);
        return match ?? { illinois_email: email, first_name: "there", professional_points: 0, service_points: 0, social_points: 0 };
      });
    } else {
      const { data: people, error: peopleError } = await supabaseAdmin
        .from("People")
        .select("illinois_email, first_name, professional_points, service_points, social_points")
        .not("auth_id", "is", null)
        .not("illinois_email", "is", null)
        .neq("illinois_email", "");
      if (peopleError) throw peopleError;
      recipients = people ?? [];
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        wouldSendTo: recipients.map((r) => r.illinois_email),
        count: recipients.length,
        message: `Dry run: would send to ${recipients.length} people.`,
      });
    }

    const todayFormatted = new Date().toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Chicago",
    });

    let sentCount = 0;
    const failed: string[] = [];

    for (const person of recipients) {
      const progressLines = [
        `Professional: ${person.professional_points ?? 0}/${goals.professional_goal} points${(person.professional_points ?? 0) >= goals.professional_goal ? " — goal met!" : ""}`,
        `Service: ${person.service_points ?? 0}/${goals.service_goal} points${(person.service_points ?? 0) >= goals.service_goal ? " — goal met!" : ""}`,
        `Social: ${person.social_points ?? 0}/${goals.social_goal} points${(person.social_points ?? 0) >= goals.social_goal ? " — goal met!" : ""}`,
      ];

      const message = `Hi ${person.first_name || "there"},\n\nHere's your points progress as of ${todayFormatted}:\n\n${progressLines.join("\n")}\n\nHere are the events coming up this week:\n\n${eventsBlock}`;

      try {
        await sendEmail(person.illinois_email, "This Week at NOBE", message);
        sentCount++;
      } catch (err: any) {
        console.error(`Failed to send to ${person.illinois_email}:`, err.message);
        failed.push(person.illinois_email);
      }
    }

    // Clear the reminder note after a real, full send (not test emails).
    if (!testEmails && reminderText) {
      await supabaseAdmin.from("weekly_reminder_note").update({ text: "" }).eq("id", 1);
    }

    return NextResponse.json({
      ok: true,
      sent: sentCount,
      failed,
      testMode: !!testEmails,
      message: testEmails
        ? `Test digest sent to ${testEmails.join(", ")}.`
        : `Sent ${sentCount} weekly digest emails.${failed.length > 0 ? ` ${failed.length} failed.` : ""}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unexpected server error." }, { status: 500 });
  }
}