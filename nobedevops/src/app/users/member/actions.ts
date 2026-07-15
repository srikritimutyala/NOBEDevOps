"use server";

import { createClient } from "@/app/utils/supabase/server";

export async function updateMemberProfile({
  first_name,
  last_name,
  year,
  college,
  major,
}: {
  first_name: string;
  last_name: string;
  year: string;
  college: string;
  major: string;
}) {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { error: 'Not authenticated.' };

  const { error } = await supabase
    .from('People')
    .update({
      first_name,
      last_name,
      name: `${first_name} ${last_name}`,
      year,
      college,
      major,
      illinois_email: user.email,
    })
    .eq('auth_id', user.id);

  if (error) return { error: error.message };
  return { error: null };
}

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