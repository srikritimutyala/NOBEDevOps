import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/app/utils/supabase/server";

export async function POST(request: Request) {
  try {
    // 1. Verify authenticated admin user. No automatic/cron execution permitted.
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in." },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from("People")
      .select("role")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (profile?.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required." },
        { status: 403 }
      );
    }

    // Parse optional eventId from body if processing a specific event
    let targetEventId: string | null = null;
    try {
      const body = await request.json().catch(() => null);
      if (body?.eventId) {
        targetEventId = String(body.eventId).trim();
      }
    } catch (_) {}

    // Initialize Supabase admin client for batch updates
    const adminClient = createAdminClient();
    const now = new Date();

    // 2. Fetch events to process
    let eventsQuery = adminClient
      .from("events")
      .select("id, name, check_in_ends_at, date, event_type, is_mandatory, strikes_processed");

    if (targetEventId) {
      eventsQuery = eventsQuery.eq("id", targetEventId);
    } else {
      eventsQuery = eventsQuery
        .eq("is_mandatory", true)
        .eq("strikes_processed", false);
    }

    const { data: rawEvents, error: eventsError } = await eventsQuery;

    if (eventsError) {
      console.error("Process Strikes: Failed to fetch events", eventsError);
      return NextResponse.json(
        { error: "Failed to fetch events: " + eventsError.message },
        { status: 500 }
      );
    }

    // Filter to events that have concluded
    const unprocessedEvents = (rawEvents || []).filter((e) => {
      const eventEnd = e.check_in_ends_at || e.date;
      if (!eventEnd) return false;
      const endDate = new Date(eventEnd);
      return !isNaN(endDate.getTime()) && endDate.getTime() <= now.getTime();
    });

    if (unprocessedEvents.length === 0) {
      return NextResponse.json({
        ok: true,
        message: targetEventId
          ? "Event has either not concluded yet or already has strikes processed."
          : "No mandatory events currently require strike processing.",
        results: [],
      });
    }

    const results = [];

    for (const event of unprocessedEvents) {
      console.log(`Processing strikes for event: ${event.name} (${event.id})`);

      // 3. Get all people
      const { data: people, error: peopleError } = await adminClient
        .from("People")
        .select("auth_id, name, illinois_email, strikes, role, is_new_member");

      if (peopleError || !people) {
        console.error("Process Strikes: Failed to fetch people", peopleError);
        continue;
      }

      // 4. Get attendance for this event
      const { data: attendance, error: attendanceError } = await adminClient
        .from("attendance")
        .select("user_id")
        .eq("event_id", event.id);

      if (attendanceError) {
        console.error(`Process Strikes: Failed to fetch attendance for event ${event.id}`, attendanceError);
        continue;
      }

      const attendedUserIds = new Set((attendance || []).map((a) => a.user_id));

      // 5. Get absences for this event (distinguishing APPROVED vs PENDING)
      const { data: absences, error: absencesError } = await adminClient
        .from("excused_absences")
        .select("user_id, status")
        .eq("event_id", event.id);

      if (absencesError) {
        console.error(`Process Strikes: Failed to fetch absences for event ${event.id}`, absencesError);
        continue;
      }

      const approvedAbsenceUserIds = new Set(
        (absences || [])
          .filter((a) => a.status?.toUpperCase() === "APPROVED")
          .map((a) => a.user_id)
      );

      const pendingAbsenceUserIds = new Set(
        (absences || [])
          .filter((a) => !a.status || a.status?.toUpperCase() === "PENDING")
          .map((a) => a.user_id)
      );

      // Event audience targeting
      const evNameLower = (event.name || "").toLowerCase();
      const isCurrentMemberOnly =
        evNameLower.includes("current member") || evNameLower.includes("returning member");
      const isNewMemberOnly =
        evNameLower.includes("new member") || event.event_type === "NEW_MEMBER_WORKSHOP";

      const struckUsers = [];
      let pendingSkippedCount = 0;

      for (const person of people) {
        if (!person.auth_id) continue;

        // Admins are officers and exempt from strikes
        if (person.role?.toUpperCase() === "ADMIN") {
          // Ensure admin has 0 strikes
          if ((person.strikes || 0) > 0) {
            await adminClient
              .from("People")
              .update({ strikes: 0 })
              .eq("auth_id", person.auth_id);
          }
          continue;
        }

        // Audience check
        if (isCurrentMemberOnly && person.is_new_member) continue;
        if (isNewMemberOnly && !person.is_new_member) continue;

        // If person attended: Ensure no active strike exists for this event
        if (attendedUserIds.has(person.auth_id)) {
          const { data: existingActive } = await adminClient
            .from("strikes")
            .select("id")
            .eq("user_id", person.auth_id)
            .eq("event_id", event.id)
            .eq("status", "ACTIVE");

          if (existingActive && existingActive.length > 0) {
            await adminClient
              .from("strikes")
              .update({
                status: "REMOVED",
                removed_at: new Date().toISOString(),
                admin_note: "Automatically removed because member attended the event.",
              })
              .eq("user_id", person.auth_id)
              .eq("event_id", event.id);

            // Sync strikes
            const { count } = await adminClient
              .from("strikes")
              .select("*", { count: "exact", head: true })
              .eq("user_id", person.auth_id)
              .eq("status", "ACTIVE");

            await adminClient
              .from("People")
              .update({ strikes: count ?? 0 })
              .eq("auth_id", person.auth_id);
          }
          continue;
        }

        // If person has approved absence: Ensure no active strike exists for this event
        if (approvedAbsenceUserIds.has(person.auth_id)) {
          const { data: existingActive } = await adminClient
            .from("strikes")
            .select("id")
            .eq("user_id", person.auth_id)
            .eq("event_id", event.id)
            .eq("status", "ACTIVE");

          if (existingActive && existingActive.length > 0) {
            await adminClient
              .from("strikes")
              .update({
                status: "REMOVED",
                removed_at: new Date().toISOString(),
                admin_note: "Automatically removed because absence was approved.",
              })
              .eq("user_id", person.auth_id)
              .eq("event_id", event.id);

            // Sync strikes
            const { count } = await adminClient
              .from("strikes")
              .select("*", { count: "exact", head: true })
              .eq("user_id", person.auth_id)
              .eq("status", "ACTIVE");

            await adminClient
              .from("People")
              .update({ strikes: count ?? 0 })
              .eq("auth_id", person.auth_id);
          }
          continue;
        }

        // If person has a PENDING absence: DO NOT STRIKE!
        // Admin must review their excuse form first.
        if (pendingAbsenceUserIds.has(person.auth_id)) {
          pendingSkippedCount++;
          continue;
        }

        // Member did not attend and has no excused absence
        // Check if an active strike already exists for this event
        const { data: existingStrike } = await adminClient
          .from("strikes")
          .select("id")
          .eq("user_id", person.auth_id)
          .eq("event_id", event.id)
          .eq("status", "ACTIVE")
          .maybeSingle();

        if (existingStrike) {
          continue;
        }

        // Insert new strike
        const { error: insertError } = await adminClient
          .from("strikes")
          .insert({
            user_id: person.auth_id,
            event_id: event.id,
            strike_type: "MISSED_MANDATORY_EVENT",
            reason: `Missed mandatory event: ${event.name || "Mandatory Event"}`,
            status: "ACTIVE",
            source: "ADMIN_MANUAL",
            admin_note: "Generated because member missed a mandatory event without an approved absence.",
            created_by: user.id,
          });

        if (!insertError) {
          struckUsers.push(person);

          // Synchronize People.strikes accurately from the count of active strikes in strikes table
          const { count: activeCount } = await adminClient
            .from("strikes")
            .select("*", { count: "exact", head: true })
            .eq("user_id", person.auth_id)
            .eq("status", "ACTIVE");

          await adminClient
            .from("People")
            .update({ strikes: activeCount ?? 1 })
            .eq("auth_id", person.auth_id);

          if (person.illinois_email) {
            await sendStrikeEmail(
              person.illinois_email,
              person.name || "Member",
              event.name || "Mandatory Event",
              activeCount ?? 1
            );
          }
        } else {
          console.error(`Failed to insert strike for user ${person.name}`, insertError);
        }
      }

      // Mark event strikes_processed = true
      await adminClient
        .from("events")
        .update({ strikes_processed: true })
        .eq("id", event.id);

      results.push({
        event: event.name,
        struckCount: struckUsers.length,
        pendingExcusesSkipped: pendingSkippedCount,
      });
    }

    return NextResponse.json({
      ok: true,
      message: `Successfully processed strikes for ${results.length} event(s).`,
      results,
    });
  } catch (error: any) {
    console.error("Process Strikes: Unexpected error", error);
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

async function sendStrikeEmail(to: string, name: string, eventName: string, strikeCount: number) {
  const gasUrl = process.env.GAS_EMAIL_URL;
  const gasSecret = process.env.GAS_EMAIL_SECRET;

  if (!gasUrl || !gasSecret) {
    console.error("GAS email service not configured.");
    return;
  }

  const message = `Hello ${name},\n\nYou are receiving this email because you did not check in to the mandatory event "${eventName}" and do not have an approved absence request.\n\nAs a result, a strike has been added to your account. Your total strike count is now: ${strikeCount}.\n\nPlease refer to the organization's policy regarding mandatory events and strikes.\n\nBest regards,\nNOBE Administration`;

  try {
    const res = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject: `Strike Notification: ${eventName}`,
        html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
        secret: gasSecret,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`GAS email error (${res.status}):`, errorText);
    } else {
      const data = await res.json();
      if (!data.success) {
        console.error(`GAS email failed:`, data.error);
      }
    }
  } catch (error) {
    console.error("Failed to execute fetch for strike email:", error);
  }
}
