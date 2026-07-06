// app/utils/getPointRequirements.ts
import { createClient } from "@/app/utils/supabase/server"; // or client, depending on context

export async function getPointRequirements() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("point_requirements")
    .select("professional_goal, service_goal, social_goal")
    .eq("id", 1)
    .single();

  if (error || !data) {
    // sensible fallback so nothing breaks if the row is ever missing
    return { professional_goal: 7, service_goal: 3, social_goal: 5 };
  }

  return data;
}