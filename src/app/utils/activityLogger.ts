import { createAdminClient } from "@/app/utils/supabase/admin";

export type ActivityType =
  | "checkin"
  | "drop"
  | "absence"
  | "event_create"
  | "admin_event"
  | "csv_import"
  | "strike";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  description: string;
  timestamp: string;
  admin_id?: string | null;
  admin_name?: string | null;
  event_id?: string | null;
  member_id?: string | null;
};

/**
 * Persists an administrative activity log (such as member drops, attendance removals,
 * or manual event creations) to the SystemSettings key-value store.
 */
export async function logAdminActivity(item: {
  type: ActivityType;
  description: string;
  timestamp?: string;
  admin_id?: string | null;
  admin_name?: string | null;
  event_id?: string | null;
  member_id?: string | null;
}) {
  try {
    const supabaseAdmin = createAdminClient();
    const { data: existingRow } = await supabaseAdmin
      .from("SystemSettings")
      .select("value")
      .eq("key", "recent_admin_activities")
      .maybeSingle();

    let list: ActivityItem[] = [];
    if (existingRow?.value) {
      try {
        list = JSON.parse(existingRow.value);
        if (!Array.isArray(list)) list = [];
      } catch (_) {
        list = [];
      }
    }

    const newActivity: ActivityItem = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: item.type,
      description: item.description,
      timestamp: item.timestamp || new Date().toISOString(),
      admin_id: item.admin_id || null,
      admin_name: item.admin_name || null,
      event_id: item.event_id || null,
      member_id: item.member_id || null,
    };

    // Prepend and keep the latest 100 entries
    list.unshift(newActivity);
    if (list.length > 100) {
      list = list.slice(0, 100);
    }

    await supabaseAdmin.from("SystemSettings").upsert({
      key: "recent_admin_activities",
      value: JSON.stringify(list),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Failed to log admin activity:", err);
  }
}

/**
 * Records which admin created a specific event, enabling the activity breakdown
 * to attribute event creations to specific admins (or note when another admin added an event).
 */
export async function setEventCreator(
  eventId: string,
  admin: { id: string; name: string; email?: string | null },
  eventName?: string
) {
  try {
    const supabaseAdmin = createAdminClient();

    // 1. Store event-creator mapping
    await supabaseAdmin.from("SystemSettings").upsert({
      key: `event_creator_${eventId}`,
      value: JSON.stringify({
        admin_id: admin.id,
        admin_name: admin.name,
        admin_email: admin.email || null,
        event_name: eventName || null,
        created_at: new Date().toISOString(),
      }),
      updated_at: new Date().toISOString(),
    });

    // 2. Also log this event creation to recent_admin_activities
    await logAdminActivity({
      type: "event_create",
      description: `Admin ${admin.name} added event "${eventName || "Event"}"`,
      admin_id: admin.id,
      admin_name: admin.name,
      event_id: eventId,
    });
  } catch (err) {
    console.error("Failed to set event creator:", err);
  }
}
