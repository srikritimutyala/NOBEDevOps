"use server";

import { createClient } from "@/app/utils/supabase/server";

export async function getMemberStrikes() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from("strikes")
    .select("id, event_id, strike_type, reason, source, status, admin_note, created_at")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch member strikes:", error.message);
    return [];
  }

  return data ?? [];
}