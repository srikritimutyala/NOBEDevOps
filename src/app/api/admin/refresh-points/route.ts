import { NextResponse } from "next/server";
import { refreshAllMemberPoints } from "@/app/users/admin/reviewMemberStats/actions";
import { createClient } from "@/app/utils/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from("People")
      .select("role")
      .eq("auth_id", user.id)
      .maybeSingle();

    if (profile?.role?.toUpperCase() !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Admin privileges required." },
        { status: 403 }
      );
    }

    const result = await refreshAllMemberPoints();

    return NextResponse.json({
      ok: true,
      message: `Successfully refreshed points for ${result.totalMembers} members. (${result.updatedCount} updated)`,
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
