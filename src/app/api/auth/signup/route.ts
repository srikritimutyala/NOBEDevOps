import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/app/utils/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, lastName } = await req.json();

    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        { error: "First name, last name, email, and password are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail.endsWith("@illinois.edu") && normalizedEmail !== "mutyalasrikriti2006@gmail.com") {
      return NextResponse.json(
        { error: "Please use your @illinois.edu email address." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    // 1. Check if user already exists in auth.users
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const existingAuthUser = usersData?.users?.find(
      (u) => u.email?.toLowerCase().trim() === normalizedEmail
    );

    let authUserId: string;

    if (existingAuthUser) {
      // User exists in auth.users — update their password, ensure email is confirmed, and sync metadata
      const { data: updatedAuthData, error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            full_name: `${firstName.trim()} ${lastName.trim()}`,
          },
        }
      );

      if (updateAuthError || !updatedAuthData?.user) {
        return NextResponse.json(
          { error: updateAuthError?.message || "Failed to update account credentials." },
          { status: 400 }
        );
      }

      authUserId = updatedAuthData.user.id;
    } else {
      // Create fresh auth user
      const { data: newAuthData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`,
        },
      });

      if (createError || !newAuthData?.user) {
        return NextResponse.json(
          { error: createError?.message || "Failed to create authentication user." },
          { status: 400 }
        );
      }

      authUserId = newAuthData.user.id;
    }

    // 2. Link / update People table profile
    const { data: personRecord } = await supabaseAdmin
      .from("People")
      .select("id, role")
      .or(`auth_id.eq.${authUserId},illinois_email.ilike.${normalizedEmail}`)
      .maybeSingle();

    if (personRecord) {
      const { error: updateError } = await supabaseAdmin
        .from("People")
        .update({
          auth_id: authUserId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`,
          illinois_email: normalizedEmail,
          role: personRecord.role || "MEMBER",
        })
        .eq("id", personRecord.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      const { error: insertError } = await supabaseAdmin
        .from("People")
        .insert({
          auth_id: authUserId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`,
          illinois_email: normalizedEmail,
          role: "MEMBER",
        });

      if (insertError) {
        // Fallback update if trigger created it concurrently
        const { error: fallbackError } = await supabaseAdmin
          .from("People")
          .update({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            name: `${firstName.trim()} ${lastName.trim()}`,
            illinois_email: normalizedEmail,
          })
          .eq("auth_id", authUserId);

        if (fallbackError) {
          return NextResponse.json({ error: fallbackError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Account created successfully.",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Unexpected server error during signup.";
    console.error("Signup error:", errorMsg);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}
