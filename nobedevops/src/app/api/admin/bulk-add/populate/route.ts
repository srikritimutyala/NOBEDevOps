import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be logged in to populate the database." },
        { status: 401 }
      );
    }

    // Get the most recent CSV upload
    const { data: latestUpload, error: fetchError } = await supabase
      .from("csv_uploads")
      .select("content")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !latestUpload) {
      return NextResponse.json(
        { error: "No CSV uploads found." },
        { status: 404 }
      );
    }

    // Parse CSV content
    const lines = latestUpload.content.trim().split("\n");
    if (lines.length < 2) {
      return NextResponse.json(
        { error: "CSV file must have at least a header and one data row." },
        { status: 400 }
      );
    }

    const headers = lines[0].split(",").map(h => h.trim());
    const expectedHeaders = ["Name", "First Name", "Last Name", "Illinois Email", "Year", "College", "Major", "Committee"];

    if (headers.length !== expectedHeaders.length || !headers.every((h, i) => h === expectedHeaders[i])) {
      return NextResponse.json(
        { error: "CSV headers do not match expected format." },
        { status: 400 }
      );
    }

    // Parse data rows
    const peopleData = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim());
      if (values.length !== headers.length) continue; // Skip malformed rows

      const [fullName, firstName, lastName, email, year, college, major, committee] = values;

      if (!email || !fullName) continue; // Skip if essential fields missing

      peopleData.push({
        name: fullName,
        first_name: firstName,
        last_name: lastName,
        illinois_email: email,
        college,
        year,
        major,
        committee,
      });
    }

    if (peopleData.length === 0) {
      return NextResponse.json(
        { error: "No valid data rows found in CSV." },
        { status: 400 }
      );
    }

    // Insert into People table, checking for duplicates
    let insertedCount = 0;
    let existingCount = 0;
    for (const person of peopleData) {
      // Check if person already exists
      const { data: existing } = await supabase
        .from("People")
        .select("id")
        .eq("illinois_email", person.illinois_email)
        .eq("name", person.name)
        .eq("first_name", person.first_name)
        .eq("last_name", person.last_name)
        .maybeSingle();

      if (existing) {
        existingCount++;
        continue;
      }

      // Insert if not exists
      const { error: insertError } = await supabase
        .from("People")
        .insert(person);

      if (insertError) {
        throw insertError;
      }

      insertedCount++;
    }

    return NextResponse.json({
      ok: true,
      populated: insertedCount,
      existing: existingCount,
      message: `${insertedCount} entries added. ${existingCount} entries already existed.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
