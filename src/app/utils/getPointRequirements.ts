// app/utils/getPointRequirements.ts
import { createClient } from "@/app/utils/supabase/server"; // or client, depending on context

export async function getPointRequirements() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("point_requirements")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !data) {
    // Default requirements: 5 Professional, 5 pooled Service & Social, 10 Total
    return {
      professional_goal: 5,
      service_social_goal: 5,
      service_goal: 5,
      social_goal: 5,
      total_goal: 10,
    };
  }

  return {
    professional_goal: data.professional_goal ?? 5,
    service_social_goal: (data as any).service_social_goal ?? 5,
    service_goal: data.service_goal ?? 5,
    social_goal: data.social_goal ?? 5,
    total_goal: (data as any).total_goal ?? 10,
  };
}