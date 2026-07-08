import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/utils/supabase/admin";

export async function GET() {
  try {
    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from("weekly_reminder_note")
      .select("text")
      .eq("id", 1)
      .single();

    if (error) throw error;
    return NextResponse.json({ text: data?.text ?? "" });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to load reminder note." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { text } = await request.json();
    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin
      .from("weekly_reminder_note")
      .update({ text: text ?? "", updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to save reminder note." }, { status: 500 });
  }
}