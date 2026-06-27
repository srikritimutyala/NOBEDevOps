import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/app/utils/supabase/server";

export async function POST(request: Request) {
  try {
    // Check if this is an automated Vercel Cron Job
    const authHeader = request.headers.get('authorization');
    const isCronJob = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    // If it's not a cron job, verify it's an admin user clicking the button
    if (!isCronJob) {
      const supabase = await createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.log("Process Strikes: Unauthorized access attempt.");
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    } else {
        console.log("Process Strikes: Triggered automatically by Vercel Cron.");
    }

    // Initialize Supabase admin client for batch updates
    const adminClient = createAdminClient();

    // 1. Fetch mandatory events that have ended and not processed
    const now = new Date().toISOString();
    console.log(`Process Strikes: Fetching events ending before ${now}`);
    
    const { data: unprocessedEvents, error: eventsError } = await adminClient
      .from("events")
      .select("id, name, check_in_ends_at")
      .eq("is_mandatory", true)
      .eq("strikes_processed", false)
      .lt("check_in_ends_at", now);

    if (eventsError) {
      console.error("Process Strikes: Failed to fetch events", eventsError);
      return NextResponse.json(
        { error: "Failed to fetch events: " + eventsError.message },
        { status: 500 }
      );
    }

    if (!unprocessedEvents || unprocessedEvents.length === 0) {
      console.log("Process Strikes: No events to process.");
      return NextResponse.json({ ok: true, message: "No events to process." });
    }

    console.log(`Process Strikes: Found ${unprocessedEvents.length} events to process.`);
    const results = [];

    for (const event of unprocessedEvents) {
      console.log(`Processing event: ${event.name} (${event.id})`);
      
      // 2. Get all people
      const { data: people, error: peopleError } = await adminClient
        .from("People")
        .select("auth_id, name, illinois_email, strikes");

      if (peopleError || !people) {
        console.error("Process Strikes: Failed to fetch people", peopleError);
        continue;
      }

      // 3. Get attendance for this event
      const { data: attendance, error: attendanceError } = await adminClient
        .from("attendance")
        .select("user_id")
        .eq("event_id", event.id);

      if (attendanceError) {
        console.error(`Process Strikes: Failed to fetch attendance for event ${event.id}`, attendanceError);
        continue;
      }

      const attendedUserIds = new Set(attendance.map((a) => a.user_id));
      console.log(`Event ${event.id}: Found ${attendedUserIds.size} attendees.`);

      // 4. Get approved absences for this event
      const { data: excusedAbsences, error: excusedError } = await adminClient
        .from("excused_absences")
        .select("user_id")
        .eq("event_id", event.id)
        .eq("status", "APPROVED");

      if (excusedError) {
        console.error(`Process Strikes: Failed to fetch excused absences for event ${event.id}`, excusedError);
        continue;
      }

      const excusedUserIds = new Set(excusedAbsences.map((ea) => ea.user_id));
      console.log(`Event ${event.id}: Found ${excusedUserIds.size} approved absences.`);

      const struckUsers = [];

      for (const person of people) {
        if (!person.auth_id) continue;

        // If not attended and not excused
        if (!attendedUserIds.has(person.auth_id) && !excusedUserIds.has(person.auth_id)) {
          console.log(`User ${person.name} (${person.illinois_email}) missed event ${event.name}. Adding strike.`);
          
          // 5. Increment strike
          const newStrikes = (person.strikes || 0) + 1;
          
          const { error: updateError } = await adminClient
            .from("People")
            .update({ strikes: newStrikes })
            .eq("auth_id", person.auth_id);

          if (!updateError) {
            struckUsers.push(person);
            
            // 6. Send email via Resend
            if (person.illinois_email) {
              await sendStrikeEmail(person.illinois_email, person.name || "Member", event.name || "Mandatory Event", newStrikes);
            } else {
               console.log(`Warning: User ${person.name} has no illinois_email to send strike to.`);
            }
          } else {
             console.error(`Failed to update strike for user ${person.name}`, updateError);
          }
        }
      }

      // 7. Mark event as processed
      const { error: markError } = await adminClient
        .from("events")
        .update({ strikes_processed: true })
        .eq("id", event.id);
        
      if(markError) {
          console.error(`Failed to mark event ${event.id} as processed`, markError);
      } else {
          console.log(`Successfully marked event ${event.id} as processed.`);
      }

      results.push({
        event: event.name,
        struckCount: struckUsers.length,
      });
    }

    return NextResponse.json({ ok: true, results });
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
    console.log(`Attempting to send strike email to ${to} for event ${eventName} via GAS...`);

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
      } else {
        console.log(`Successfully sent strike email to ${to}`);
      }
    }
  } catch (error) {
    console.error("Failed to execute fetch for strike email:", error);
  }
}

