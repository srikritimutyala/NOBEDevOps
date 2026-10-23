import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";
import { logAdminActivity, setEventCreator, ActivityType } from "@/app/utils/activityLogger";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is an ADMIN
    const { data: member } = await supabase
      .from("People")
      .select("role, name, first_name, last_name")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (member?.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    const adminName =
      member?.first_name ||
      member?.name ||
      user.email?.split("@")[0] ||
      "Admin";

    const body = await request.json();
    const { action, eventId, eventName, type, description, memberId } = body;

    if (action === "set_event_creator" && eventId) {
      await setEventCreator(
        eventId,
        {
          id: user.id,
          name: adminName,
          email: user.email,
        },
        eventName
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "log_activity") {
      if (!description) {
        return NextResponse.json({ error: "Description is required" }, { status: 400 });
      }

      await logAdminActivity({
        type: (type as ActivityType) || "drop",
        description,
        admin_id: user.id,
        admin_name: adminName,
        event_id: eventId || null,
        member_id: memberId || null,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
