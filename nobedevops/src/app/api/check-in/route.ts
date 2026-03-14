import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { qr_code_secret } = body;

    if (!qr_code_secret) {
      return NextResponse.json(
        { ok: false, message: "No QR code secret provided." },
        { status: 400 }
      );
    }

    // 1️⃣ find the event from the QR secret
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name")
      .eq("qr_code_secret", qr_code_secret)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { ok: false, message: `Invalid QR code. ${eventError?.message ?? ""}` },
        { status: 404 }
      );
    }

    // 2️⃣ get the logged-in user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return NextResponse.json(
        { ok: false, message: "User not logged in." },
        { status: 401 }
      );
    }//do

    const user_id = user.id;

    // 3️⃣ insert attendance record
    const { error: attendanceError } = await supabase
      .from("attendance")
      .insert({
        user_id,
        event_id: event.id,
        timestamp: new Date().toISOString(),
      });

    if (attendanceError) {
      return NextResponse.json(
        {
          ok: false,
          message: `Failed to record attendance: ${attendanceError.message}`,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      event_name: event.name,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: `Server error: ${error?.message ?? "unknown"}` },
      { status: 500 }
    );
  }
}