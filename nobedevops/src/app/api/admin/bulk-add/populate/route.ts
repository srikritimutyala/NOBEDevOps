import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";
import { createAdminClient } from "@/app/utils/supabase/admin";

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

    const supabaseAdmin = createAdminClient();
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

    const parseCsvLine = (line: string) => {
      const values: string[] = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }

      values.push(current.trim());
      return values;
    };

    // Parse CSV content into rows while preserving line structure
    const rows = latestUpload.content
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (rows.length < 2) {
      return NextResponse.json(
        { error: "CSV file must have at least a header and one data row." },
        { status: 400 }
      );
    }

    const headers = parseCsvLine(rows[0]);
    const expectedHeaders = ["Name", "First Name", "Last Name", "Illinois Email", "Year", "College", "Major", "Committee"];

    if (headers.length !== expectedHeaders.length || !headers.every((h, i) => h === expectedHeaders[i])) {
      return NextResponse.json(
        { error: "CSV headers do not match expected format." },
        { status: 400 }
      );
    }

    const peopleData: Array<Record<string, string>> = [];
    const missingRows: Array<{ row: number; missingFields: string[] }> = [];

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const values = parseCsvLine(rows[rowIndex]);
      const normalizedValues = values.slice(0, expectedHeaders.length);

      while (normalizedValues.length < expectedHeaders.length) {
        normalizedValues.push("");
      }

      const [fullName, firstName, lastName, email, year, college, major, committee] = normalizedValues;
      const missingFields = expectedHeaders.filter((_, index) => !normalizedValues[index]?.trim());

      if (missingFields.length > 0) {
        missingRows.push({ row: rowIndex + 1, missingFields });
        continue;
      }

      console.log("normalizedValues:", normalizedValues);
      console.log({
        fullName,
        firstName,
        lastName,
        email,
        year,
        college,
        major,
        committee,
      });

      peopleData.push({
        name: fullName?.trim() || "",
        first_name: firstName?.trim() || "",
        last_name: lastName?.trim() || "",
        illinois_email: email?.trim() || "",
        college: college?.trim() || "",
        year: year?.trim() || "",
        major: major?.trim() || "",
        committee: committee?.trim() || "",
      });
    }

    if (peopleData.length === 0) {
      return NextResponse.json(
        { error: "No valid data rows found in CSV." },
        { status: 400 }
      );
    }

    // Insert into People table, checking for duplicates by email + first and last name
    let insertedCount = 0;
    let existingCount = 0;
    const existingRows: Array<Record<string, string>> = [];

    for (const person of peopleData) {
      let existing = null;

      if (person.illinois_email) {
        const result = await supabaseAdmin
          .from("People")
          .select("id, name, first_name, last_name, illinois_email, college, year, major, committee")
          .eq("illinois_email", person.illinois_email)
          .eq("first_name", person.first_name)
          .eq("last_name", person.last_name)
          .maybeSingle();

        existing = result.data;
      }

      if (existing) {
        existingCount++;
        existingRows.push(existing as Record<string, string>);
        continue;
      }

      const authId = crypto.randomUUID();
      
      /*const { data: inviteData, error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(person.illinois_email, {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
        });

      if (inviteError) {
        console.error("Invite error:", inviteError);
        return NextResponse.json(
          {
            error: inviteError.message,
            details: inviteError,
          },
          { status: 500 }
        );
      }

      const authId = inviteData.user?.id;*/

      const { data: existingByAuth } = await supabaseAdmin
        .from("People")
        .select("id")
        .eq("auth_id", authId)
        .maybeSingle();

      if (existingByAuth) {
        const { error: updateError } = await supabaseAdmin
          .from("People")
          .update({
            ...person,
            role: "MEMBER",
          })
          .eq("id", existingByAuth.id);

        if (updateError) {
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabaseAdmin
          .from("People")
          .insert({
            ...person,
            auth_id: authId,
            role: "MEMBER",
          });

        if (insertError) {
          throw insertError;
        }
      }

      insertedCount++;
    }

    return NextResponse.json({
      ok: true,
      populated: insertedCount,
      existing: existingCount,
      duplicates: existingRows,
      missing: missingRows.length,
      missingRows,
      message: `${insertedCount} entries added. ${existingCount} entries already existed.${
        missingRows.length > 0 ? ` ${missingRows.length} row(s) had missing fields.` : ""
      }`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}
