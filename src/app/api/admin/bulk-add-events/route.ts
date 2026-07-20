import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";
import { google } from "googleapis";
import crypto from "crypto";

const CLUB_CALENDAR_ID =
  "f4953a68bd3b75e409d7490b65356747c22af1e3fc89b177d6bad1b93a88e097@group.calendar.google.com";

function generateSecret64() {
  return crypto
    .randomBytes(48)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function syncEventToGCal(
  event: {
    name: string;
    event_type: string;
    date: string;
    check_in_ends_at: string;
    location?: string;
    points?: number;
    dresscode?: string;
    is_mandatory?: boolean;
  },
  calendarId: string
) {
  try {
    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET ||
      !process.env.GOOGLE_REFRESH_TOKEN
    ) {
      console.warn("Google Calendar environment variables are not fully configured. Skipping GCal sync.");
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const start = new Date(event.date);
    const end = new Date(event.check_in_ends_at);

    const descriptionLines = [
      `Type: ${event.event_type}`,
      `Points: ${event.points ?? 0}`,
      event.dresscode ? `Dress Code: ${event.dresscode}` : null,
      event.is_mandatory ? "Mandatory: Yes" : null,
    ].filter(Boolean);

    const result = await calendar.events.insert({
      calendarId: calendarId,
      requestBody: {
        summary: event.name,
        location: event.location || "",
        description: descriptionLines.join("\n"),
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });

    return result.data.id ?? null;
  } catch (err: any) {
    console.error("Error syncing to GCal in bulk:", err?.message || err);
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to import events." },
        { status: 401 }
      );
    }

    // Verify Admin privileges
    const { data: userProfile, error: profileError } = await supabase
      .from("People")
      .select("role")
      .eq("auth_id", user.id)
      .single();

    if (profileError || !userProfile || userProfile.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized. Admin privileges required." },
        { status: 403 }
      );
    }

    // Fetch custom calendar ID if it exists in SystemSettings
    const { data: dbSettings } = await supabase
      .from("SystemSettings")
      .select("value")
      .eq("key", "club_calendar_id")
      .maybeSingle();
    const calendarId = dbSettings?.value || CLUB_CALENDAR_ID;

    const body = await request.json();
    const events = body?.events;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "No events were provided for import." },
        { status: 400 }
      );
    }

    const insertedEvents: any[] = [];
    const skippedDuplicates: any[] = [];
    const failedEvents: any[] = [];
    let gcalSyncCount = 0;
    let gcalFailCount = 0;

    for (const rawEvent of events) {
      try {
        const name = rawEvent.name?.trim();
        const dateISO = rawEvent.date;
        const checkInStartsAt = rawEvent.check_in_starts_at;
        const checkInEndsAt = rawEvent.check_in_ends_at;
        const points = Number(rawEvent.points) || 0;
        const eventType = rawEvent.event_type || "PROFESSIONAL";
        const isMandatory = Boolean(rawEvent.is_mandatory);
        const location = rawEvent.location?.trim() || "TBD";
        const dresscode = rawEvent.dresscode?.trim() || "Casual";

        if (!name || !dateISO || !checkInStartsAt || !checkInEndsAt) {
          failedEvents.push({
            event: rawEvent,
            reason: "Missing required fields (name, date, start time, or end time)",
          });
          continue;
        }

        // 1. Check for duplicates (case-insensitive name AND same ISO date)
        const { data: existing, error: dupError } = await supabase
          .from("events")
          .select("id, name, date")
          .eq("date", dateISO);

        if (dupError) {
          failedEvents.push({
            event: rawEvent,
            reason: `Database error check: ${dupError.message}`,
          });
          continue;
        }

        const isDuplicate = existing?.some(
          (e) => e.name?.toLowerCase().trim() === name.toLowerCase()
        );

        if (isDuplicate) {
          skippedDuplicates.push({
            name,
            date: dateISO,
            event_type: eventType,
          });
          continue;
        }

        const secret = generateSecret64();

        const payload = {
          name,
          event_type: eventType,
          dresscode,
          points,
          is_mandatory: isMandatory,
          date: dateISO,
          check_in_starts_at: checkInStartsAt,
          check_in_ends_at: checkInEndsAt,
          location,
          created_at: new Date().toISOString(),
          qr_code_secret: secret,
          gcal_event_id: null as string | null,
        };

        // Sync to Google Calendar
        const gcalId = await syncEventToGCal(payload, calendarId);
        if (gcalId) {
          payload.gcal_event_id = gcalId;
          gcalSyncCount++;
        } else {
          gcalFailCount++;
        }

        // Insert event into Supabase
        const { data: inserted, error: insertError } = await supabase
          .from("events")
          .insert(payload)
          .select("id")
          .single();

        if (insertError) {
          failedEvents.push({
            event: rawEvent,
            reason: `Database insert error: ${insertError.message}`,
          });
          continue;
        }

        insertedEvents.push({
          id: inserted?.id,
          name,
          date: dateISO,
          event_type: eventType,
        });
      } catch (err: any) {
        failedEvents.push({
          event: rawEvent,
          reason: err?.message || "Unexpected row processing error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      addedCount: insertedEvents.length,
      skippedCount: skippedDuplicates.length,
      failedCount: failedEvents.length,
      insertedEvents,
      skippedDuplicates,
      failedEvents,
      gcalSyncCount,
      gcalFailCount,
      message: `${insertedEvents.length} events added successfully. ${skippedDuplicates.length} duplicate events skipped.${
        failedEvents.length > 0 ? ` ${failedEvents.length} events failed to import.` : ""
      }${gcalSyncCount > 0 ? ` Synced ${gcalSyncCount} to Google Calendar.` : ""}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
