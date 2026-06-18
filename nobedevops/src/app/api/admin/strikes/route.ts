import { NextResponse } from "next/server";
import { createClient } from "@/app/utils/supabase/server";

export async function POST(request: Request) {
    try {
        const supabase = await createClient();
        const {
            data: { user: adminUser },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !adminUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const {
            user_id,
            event_id,
            strike_type,
            reason,
            admin_note,
        } = body;

        if (!user_id || !strike_type || !reason) {
            return NextResponse.json(
                { error: "Missing required fields: user_id, strike_type, and reason are required." },
                { status: 400 }
            );
        }

        // 1. Insert the strike record
        const { data: strikeData, error: strikeError } = await supabase
            .from("strikes")
            .insert({
                user_id,
                event_id: event_id || null,
                strike_type,
                reason,
                admin_note: admin_note || null,
                status: "ACTIVE",
                source: "ADMIN_MANUAL",
                created_by: adminUser.id,
            })
            .select()
            .single();

        if (strikeError) {
            console.error("Error inserting strike:", strikeError);
            return NextResponse.json({ error: strikeError.message }, { status: 500 });
        }

        // 2. Increment the strike count in the People table
        // We use auth_id to match the user
        const { data: person, error: personFetchError } = await supabase
            .from("People")
            .select("strikes")
            .eq("auth_id", user_id)
            .single();

        if (personFetchError) {
            console.error("Error fetching person:", personFetchError);
            // Even if this fails, we've recorded the strike in the strikes table.
            // But we should try to keep them in sync.
        } else {
            const newCount = (person.strikes || 0) + 1;
            const { error: updateError } = await supabase
                .from("People")
                .update({ strikes: newCount })
                .eq("auth_id", user_id);

            if (updateError) {
                console.error("Error updating person strikes:", updateError);
            }
        }

        return NextResponse.json({ ok: true, strike: strikeData });
    } catch (error: any) {
        console.error("Unexpected error in strikes API:", error);
        return NextResponse.json(
            { error: error?.message || "Unexpected server error." },
            { status: 500 }
        );
    }
}
