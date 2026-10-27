import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";
import { getPointRequirements, getRequirementsForMember } from "@/app/utils/getPointRequirements";
import { getEventPointsForMember } from "@/app/utils/eventPoints";

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
      .select("id, name, points, event_type, description, check_in_starts_at, check_in_ends_at")
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

    const { data: profile, error: profileError } = await supabase
      .from("People")
      .select(`
        professional_points,
        service_points,
        social_points,
        is_PM,
        role,
        name,
        first_name,
        is_new_member
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
      .select("id, points_awarded, point_type")
      .eq("user_id", user.id)
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { ok: false, message: "Failed to verify attendance." },
        { status: 500 }
      );
    }

    const effectivePoints = getEventPointsForMember(event, profile.is_new_member);

    if (existingAttendance) {
      const goals = await getPointRequirements();
      const isPM = Boolean(profile.is_PM);
      const reqs = getRequirementsForMember(isPM, goals, profile.role);
      const profPoints = profile.professional_points ?? 0;
      const servPoints = profile.service_points ?? 0;
      const socPoints = profile.social_points ?? 0;
      const pooledPoints = servPoints + socPoints;
      const totalPoints = profPoints + pooledPoints;

      return NextResponse.json({
        ok: true,
        already_checked_in: true,
        message: "You have already checked in to this event.",
        event_name: event.name,
        points_awarded: existingAttendance.points_awarded ?? effectivePoints,
        point_type: event.event_type,
        progress: {
          ...profile,
          is_PM: isPM,
          role: profile.role,
          isExempt: reqs.isExempt,
          professional_points: profPoints,
          service_points: servPoints,
          social_points: socPoints,
          pooled_points: pooledPoints,
          total_points: totalPoints,
          professional_goal: reqs.professional_goal,
          service_social_goal: reqs.service_social_goal,
          service_goal: reqs.service_goal,
          social_goal: reqs.social_goal,
          total_goal: reqs.total_goal,
        },
      });
    }

    const updates: Record<string, number> = {};
    const normType = (event.event_type ?? "").toUpperCase();

    if (normType.includes("PROF")) {
      updates.professional_points =
        (profile.professional_points ?? 0) + effectivePoints;
    } else if (normType.includes("SERV")) {
      updates.service_points =
        (profile.service_points ?? 0) + effectivePoints;
    } else if (normType.includes("SOCI")) {
      updates.social_points =
        (profile.social_points ?? 0) + effectivePoints;
    }

    const { error: attendanceError } = await supabase
      .from("attendance")
      .insert({
        user_id: user.id,
        event_id: event.id,
        timestamp: new Date().toISOString(),
        points_awarded: effectivePoints,
        point_type: event.event_type,
      });

    if (attendanceError) {
      return NextResponse.json(
        { ok: false, message: attendanceError.message },
        { status: 400 }
      );
    }

    let updatedProfile = profile;
    if (Object.keys(updates).length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from("People")
        .update(updates)
        .eq("auth_id", user.id)
        .select(`
          professional_points,
          service_points,
          social_points,
          is_PM,
          role,
          name,
          first_name,
          is_new_member
        `)
        .single();

      if (!updateError && updated) {
        updatedProfile = updated;
      }
    }

    const goals = await getPointRequirements();
    const isPM = Boolean(updatedProfile.is_PM);
    const reqs = getRequirementsForMember(isPM, goals, updatedProfile.role);
    const profPoints = updatedProfile.professional_points ?? 0;
    const servPoints = updatedProfile.service_points ?? 0;
    const socPoints = updatedProfile.social_points ?? 0;
    const pooledPoints = servPoints + socPoints;
    const totalPoints = profPoints + pooledPoints;

    return NextResponse.json({
      ok: true,
      already_checked_in: false,
      message: `Checked in to ${event.name}!`,
      event_name: event.name,
      points_awarded: effectivePoints,
      point_type: event.event_type,
      progress: {
        ...updatedProfile,
        is_PM: isPM,
        role: updatedProfile.role,
        isExempt: reqs.isExempt,
        professional_points: profPoints,
        service_points: servPoints,
        social_points: socPoints,
        pooled_points: pooledPoints,
        total_points: totalPoints,
        professional_goal: reqs.professional_goal,
        service_social_goal: reqs.service_social_goal,
        service_goal: reqs.service_goal,
        social_goal: reqs.social_goal,
        total_goal: reqs.total_goal,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}