import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";

function formatChicagoTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Chicago",
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const body = await req.json();
    const { qr_code_secret } = body;

    if (!qr_code_secret) {
      return NextResponse.json(
        { ok: false, message: "No QR code secret provided." },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, message: "User not logged in." },
        { status: 401 }
      );
    }

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name, check_in_starts_at, check_in_ends_at")
      .eq("qr_code_secret", qr_code_secret)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { ok: false, message: "Invalid QR code." },
        { status: 404 }
      );
    }

    const now = new Date();

    if (event.check_in_starts_at) {
      const startsAt = new Date(event.check_in_starts_at);
      if (now < startsAt) {
        return NextResponse.json(
          {
            ok: false,
            message: `Check-in opens at ${formatChicagoTime(event.check_in_starts_at)}.`,
          },
          { status: 403 }
        );
      }
    }

    if (event.check_in_ends_at) {
      const endsAt = new Date(event.check_in_ends_at);
      if (now > endsAt) {
        return NextResponse.json(
          {
            ok: false,
            message: `Check-in closed at ${formatChicagoTime(event.check_in_ends_at)}.`,
          },
          { status: 403 }
        );
      }
    }

    const { data: existingAttendance, error: existingError } = await supabase
      .from("attendance")
      .select("id")
      .eq("user_id", user.id)
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { ok: false, message: "Failed to verify attendance." },
        { status: 500 }
      );
    }

    if (existingAttendance) {
      return NextResponse.json(
        { ok: false, message: "You have already checked in to this event." },
        { status: 409 }
      );
    }

    const { error: attendanceError } = await supabase
      .from("attendance")
      .insert({
        user_id: user.id,
        event_id: event.id,
        timestamp: new Date().toISOString(),
      });

    if (attendanceError) {
      return NextResponse.json(
        { ok: false, message: attendanceError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      event_name: event.name,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
