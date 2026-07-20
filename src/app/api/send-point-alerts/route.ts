import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/utils/supabase/admin";
import { sendEmail } from "@/app/utils/sendEmail";
import { getPointRequirements } from "@/app/utils/getPointRequirements";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testEmail = searchParams.get("testEmail");

    const supabaseAdmin = createAdminClient();
    const goals = await getPointRequirements();

    const { data: people, error: peopleError } = await supabaseAdmin
      .from("People")
      .select("illinois_email, first_name, professional_points, service_points, social_points")
      .not("auth_id", "is", null)
      .not("illinois_email", "is", null);

    if (peopleError || !people) {
      throw peopleError || new Error("Failed to load people.");
    }

    const now = new Date().toISOString();
    const { data: upcomingEvents, error: eventsError } = await supabaseAdmin
      .from("events")
      .select("name, event_type, date")
      .gt("date", now)
      .order("date", { ascending: true });

    if (eventsError) {
      throw eventsError;
    }

    const eventsByType: Record<string, typeof upcomingEvents> = {
      PROFESSIONAL: [],
      SERVICE: [],
      SOCIAL: [],
    };
    for (const event of upcomingEvents ?? []) {
      if (eventsByType[event.event_type]) {
        eventsByType[event.event_type].push(event);
      }
    }

    // In test mode, only process ONE person so you're not looping through
    // your whole roster (all mail would go to testEmail anyway, but this
    // also saves you from watching 50 iterations of console logs).
    const targetPeople = testEmail
        ? people.filter((p) => p.illinois_email === testEmail).length > 0
            ? people.filter((p) => p.illinois_email === testEmail)
            : people.slice(0, 1)
        : people;

    let sentCount = 0;
    const failed: string[] = [];

    for (const person of targetPeople) {
      const todayFormatted = new Date().toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Chicago",
      });
      const categories = [
        { label: "Professional", points: person.professional_points ?? 0, goal: goals.professional_goal, type: "PROFESSIONAL" },
        { label: "Service", points: person.service_points ?? 0, goal: goals.service_goal, type: "SERVICE" },
        { label: "Social", points: person.social_points ?? 0, goal: goals.social_goal, type: "SOCIAL" },
      ];

      const progressLines: string[] = [];
      const eventLines: string[] = [];

      for (const cat of categories) {
      const remaining = Math.max(cat.goal - cat.points, 0);
      progressLines.push(`${cat.label}: ${cat.points}/${cat.goal} points${remaining === 0 ? " — goal met!" : ""}`);

      if (remaining > 0 && eventsByType[cat.type].length > 0) {
        const upcoming = eventsByType[cat.type].slice(0, 3);
        eventLines.push(`Upcoming ${cat.label.toLowerCase()} events:`);
        for (const e of upcoming) {
            const formatted = new Date(e.date).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "America/Chicago",
            });
            eventLines.push(`  - ${e.name} (${formatted})`);
        }
      }
    }

    const lines = [...progressLines, "", ...eventLines];

      const recipient = testEmail || person.illinois_email;
      const message = `Hi ${person.first_name || "there"},\n\nHere's your points progress as of ${todayFormatted}:\n\n${lines.join("\n")}`;

      try {
        await sendEmail(recipient, `${todayFormatted} NOBE Points Update`, message);
        sentCount++;
      } catch (err: any) {
        console.error(`Failed to send to ${recipient}:`, err.message);
        failed.push(recipient);
      }
    }

    return NextResponse.json({
      ok: true,
      sent: sentCount,
      failed,
      testMode: !!testEmail,
      message: testEmail
        ? `Test email sent to ${testEmail} using ${targetPeople[0]?.illinois_email ?? "N/A"}'s data.`
        : `Sent ${sentCount} point alert emails.${failed.length > 0 ? ` ${failed.length} failed.` : ""}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}