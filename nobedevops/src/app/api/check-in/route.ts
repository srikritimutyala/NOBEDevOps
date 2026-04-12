import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";

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
      .select("id, name, points, event_type")
      .eq("qr_code_secret", qr_code_secret)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { ok: false, message: "Invalid QR code." },
        { status: 404 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("People")
      .select(`
        professional_points,
        service_points,
        social_points
      `)
      .eq("auth_id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { ok: false, message: "Failed to load user profile." },
        { status: 500 }
      );
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

    const updates: Record<string, number> = {};

    if (event.event_type === "PROFESSIONAL") {
      updates.professional_points =
        (profile.professional_points ?? 0) + (event.points ?? 0);
    } else if (event.event_type === "SERVICE") {
      updates.service_points =
        (profile.service_points ?? 0) + (event.points ?? 0);
    } else if (event.event_type === "SOCIAL") {
      updates.social_points =
        (profile.social_points ?? 0) + (event.points ?? 0);
    } else {
      return NextResponse.json(
        { ok: false, message: `Unsupported event type: ${event.event_type}` },
        { status: 400 }
      );
    }

    const { error: attendanceError } = await supabase
      .from("attendance")
      .insert({
        user_id: user.id,
        event_id: event.id,
        timestamp: new Date().toISOString(),
        points_awarded: event.points,
        point_type: event.event_type,
      });

    if (attendanceError) {
      return NextResponse.json(
        { ok: false, message: attendanceError.message },
        { status: 400 }
      );
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from("People")
      .update(updates)
      .eq("auth_id", user.id)
      .select(`
        professional_points,
        service_points,
        social_points
      `)
      .single();

    if (updateError || !updatedProfile) {
      return NextResponse.json(
        { ok: false, message: "Attendance saved, but failed to update points." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Checked in to ${event.name}!`,
      event_name: event.name,
      points_awarded: event.points,
      point_type: event.event_type,
      progress: updatedProfile,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}