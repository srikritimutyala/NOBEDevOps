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
        { ok: false, message: "no qr code." },
        { status: 400 }
      );
    }

    // Find event by QR secret
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, name")
      .eq("qr_code_secret", qr_code_secret)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { ok: false, message: "Invalid QR code." },
        { status: 404 }
      );
    }


    const user_id = "TEMP_USER_ID";

    const { error: attendanceError } = await supabase
      .from("attendance")
      .insert({
        user_id,
        event_id: event.id,
        timestamp: new Date().toISOString(),
      });

    if (attendanceError) {
      return NextResponse.json({
        ok: false,
        message: " checked in or failed to record attendance.",
      });
    }

    return NextResponse.json({
      ok: true,
      event_name: event.name,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: "Server error." },
      { status: 500 }
    );
  }
}