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

export function getRequirementsForMember(
  isPM?: boolean | null,
  baseGoals?: {
    professional_goal?: number;
    service_social_goal?: number;
    service_goal?: number;
    social_goal?: number;
    total_goal?: number;
  },
  role?: string | null
) {
  if (role?.toUpperCase() === "ADMIN") {
    return {
      professional_goal: 0,
      service_social_goal: 0,
      service_goal: 0,
      social_goal: 0,
      total_goal: 0,
      isExempt: true,
    };
  }

  if (isPM) {
    return {
      professional_goal: 4,
      service_social_goal: 4,
      service_goal: 4,
      social_goal: 4,
      total_goal: 8,
      isExempt: false,
    };
  }

  return {
    professional_goal: baseGoals?.professional_goal ?? 5,
    service_social_goal: baseGoals?.service_social_goal ?? 5,
    service_goal: baseGoals?.service_goal ?? 5,
    social_goal: baseGoals?.social_goal ?? 5,
    total_goal: baseGoals?.total_goal ?? 10,
    isExempt: false,
  };
}