import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";
import { createAdminClient } from "@/app/utils/supabase/admin";
import { sendEmail } from "@/app/utils/sendEmail";

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
    const { data: latestUpload, error: fetchError } = await supabase
      .from("csv_uploads")
      .select("content")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !latestUpload) {
      return NextResponse.json({ error: "No CSV uploads found." }, { status: 404 });
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
    const rows = (latestUpload.content as string)
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

    const rawHeaders = parseCsvLine(rows[0]);

    const headerIndexes: Record<string, number> = {
      name: -1,
      first_name: -1,
      last_name: -1,
      illinois_email: -1,
      year: -1,
      college: -1,
      major: -1,
      committee: -1,
    };

    rawHeaders.forEach((h, idx) => {
      const norm = h.toLowerCase().trim();
      if (norm === "name" || norm === "full name" || norm === "fullname") {
        headerIndexes.name = idx;
      } else if (norm === "first name" || norm === "first_name" || norm === "firstname") {
        headerIndexes.first_name = idx;
      } else if (norm === "last name" || norm === "last_name" || norm === "lastname") {
        headerIndexes.last_name = idx;
      } else if (norm === "illinois email" || norm === "illinois_email" || norm === "email" || norm === "email address") {
        headerIndexes.illinois_email = idx;
      } else if (norm === "year" || norm === "class year" || norm === "grade") {
        headerIndexes.year = idx;
      } else if (norm === "college" || norm === "school") {
        headerIndexes.college = idx;
      } else if (norm === "major" || norm === "field of study") {
        headerIndexes.major = idx;
      } else if (norm === "committee" || norm === "team") {
        headerIndexes.committee = idx;
      }
    });

    const missingHeaderLabels: string[] = [];
    if (headerIndexes.name === -1 && (headerIndexes.first_name === -1 || headerIndexes.last_name === -1)) {
      if (headerIndexes.name === -1) missingHeaderLabels.push("Name");
      if (headerIndexes.first_name === -1) missingHeaderLabels.push("First Name");
      if (headerIndexes.last_name === -1) missingHeaderLabels.push("Last Name");
    }
    if (headerIndexes.illinois_email === -1) missingHeaderLabels.push("Illinois Email");
    if (headerIndexes.year === -1) missingHeaderLabels.push("Year");
    if (headerIndexes.college === -1) missingHeaderLabels.push("College");
    if (headerIndexes.major === -1) missingHeaderLabels.push("Major");
    if (headerIndexes.committee === -1) missingHeaderLabels.push("Committee");

    if (missingHeaderLabels.length > 0) {
      return NextResponse.json(
        { error: `CSV headers do not match expected format. Missing header(s): ${missingHeaderLabels.join(", ")}.` },
        { status: 400 }
      );
    }

    const peopleData: Array<Record<string, string>> = [];
    const missingRows: Array<{ row: number; missingFields: string[] }> = [];
    const expectedHeaderNames = ["Name", "First Name", "Last Name", "Illinois Email", "Year", "College", "Major", "Committee"];

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
      const values = parseCsvLine(rows[rowIndex]);
      const getValue = (idx: number) => (idx >= 0 && idx < values.length ? values[idx].trim() : "");

      let fullName = getValue(headerIndexes.name);
      let firstName = getValue(headerIndexes.first_name);
      let lastName = getValue(headerIndexes.last_name);
      const email = getValue(headerIndexes.illinois_email);
      const year = getValue(headerIndexes.year);
      const college = getValue(headerIndexes.college);
      const major = getValue(headerIndexes.major);
      const committee = getValue(headerIndexes.committee);

      if (!fullName && firstName && lastName) {
        fullName = `${firstName} ${lastName}`.trim();
      }
      if ((!firstName || !lastName) && fullName) {
        const parts = fullName.split(" ");
        if (!firstName) firstName = parts[0] || "";
        if (!lastName) lastName = parts.slice(1).join(" ") || "";
      }

      const rowMap: Record<string, string> = {
        "Name": fullName,
        "First Name": firstName,
        "Last Name": lastName,
        "Illinois Email": email,
        "Year": year,
        "College": college,
        "Major": major,
        "Committee": committee,
      };

      const missingFields = expectedHeaderNames.filter((h) => !rowMap[h]?.trim());

      if (missingFields.length > 0) {
        missingRows.push({ row: rowIndex + 1, missingFields });
        continue; // skip incomplete rows entirely — no invite, no insert
      }

      peopleData.push({
        name: fullName.trim(),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        illinois_email: email.trim(),
        college: college.trim(),
        year: year.trim(),
        major: major.trim(),
        committee: committee.trim(),
      });
    }

    if (peopleData.length === 0) {
      return NextResponse.json({ error: "No valid data rows found in CSV." }, { status: 400 });
    }

    let insertedCount = 0;
    let existingCount = 0;
    let emailFailures: string[] = [];
    const existingRows: Array<Record<string, string>> = [];

    for (const person of peopleData) {
      const { data: existing } = await supabaseAdmin
        .from("People")
        .select("id, name, first_name, last_name, illinois_email, college, year, major, committee")
        .eq("illinois_email", person.illinois_email)
        .eq("first_name", person.first_name)
        .eq("last_name", person.last_name)
        .maybeSingle();

      if (existing) {
        existingCount++;
        existingRows.push(existing as Record<string, string>);
        continue;
      }

      // Create the auth user + get an invite link, WITHOUT Supabase sending its own email
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "invite",
        email: person.illinois_email,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
        },
      });

      if (linkError || !linkData?.user?.id || !linkData?.properties?.action_link) {
        console.error(`Failed to generate invite link for ${person.illinois_email}:`, linkError);
        emailFailures.push(person.illinois_email);
        continue;
      }

      const authId = linkData.user.id;
      const tokenHash = linkData.properties.hashed_token;
      const inviteLink = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?token_hash=${tokenHash}&type=invite`;

      // The handle_new_user trigger already created a bare-bones People row
      // for this auth_id — update it with the real CSV data instead of inserting.
      const { data: existingByAuth } = await supabaseAdmin
        .from("People")
        .select("id")
        .eq("auth_id", authId)
        .maybeSingle();

      if (existingByAuth) {
        const { error: updateError } = await supabaseAdmin
          .from("People")
          .update({ ...person, role: "MEMBER" })
          .eq("id", existingByAuth.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabaseAdmin
          .from("People")
          .insert({ ...person, auth_id: authId, role: "MEMBER" });
        if (insertError) throw insertError;
      }

      // Send the branded invite email through our own GAS pipeline
      try {
        await sendEmail(
          person.illinois_email,
          "Welcome to NOBE! Create Your Attendance Portal Account",
          `Hi ${person.first_name},\n\nYou've been added to NOBE's Attendance Portal! Click the link below to set your password and access your member account:\n\n${inviteLink}\n\nSee you soon,\nThe NOBE Team`
        );
      } catch (emailErr: any) {
        console.error(`Failed to send invite email to ${person.illinois_email}:`, emailErr.message);
        emailFailures.push(person.illinois_email);
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
      emailFailures,
      message: `${insertedCount} entries added. ${existingCount} entries already existed.${
        missingRows.length > 0 ? ` ${missingRows.length} row(s) had missing fields and were skipped.` : ""
      }${emailFailures.length > 0 ? ` ${emailFailures.length} invite email(s) failed to send.` : ""}`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unexpected server error." }, { status: 500 });
  }
}