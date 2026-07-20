import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const uploads = body?.uploads;

    if (!Array.isArray(uploads) || uploads.length === 0) {
      return NextResponse.json(
        { error: "No CSV files were provided." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to upload CSV files." },
        { status: 401 }
      );
    }

    const rows = uploads.map((file: any) => ({
      file_name: file.name,
      mime_type: file.type || "text/csv",
      content: file.content,
      uploaded_by: user.id,
      uploaded_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("csv_uploads").insert(rows);

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to save CSV uploads." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, uploaded: rows.length });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
