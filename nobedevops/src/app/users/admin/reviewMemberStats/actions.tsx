"use server";

import { createClient } from "@/app/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function deleteMember(
    memberId: number,
    authId: string | null
) {
    const supabase = await createClient();

    if (authId) {
        await supabase
            .from("attendance")
            .delete()
            .eq("user_id", authId);

        await supabase
            .from("excused_absences")
            .delete()
            .eq("user_id", authId);
    }

    const { error } = await supabase
        .from("People")
        .delete()
        .eq("id", memberId);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
}

export async function addStrike(formData: FormData) {
    const supabase = await createClient();

    const memberAuthId = String(formData.get("memberAuthId") ?? "");
    const eventIdRaw = String(formData.get("eventId") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    const adminNote = String(formData.get("adminNote") ?? "").trim();

    if (!memberAuthId) {
        throw new Error("Missing member auth id.");
    }

    if (!reason) {
        throw new Error("Strike reason is required.");
    }

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
        throw new Error(userError.message);
    }

    const { error } = await supabase.from("strikes").insert({
        user_id: memberAuthId,
        event_id: eventIdRaw || null,
        strike_type: "MANUAL_ADJUSTMENT",
        reason,
        status: "ACTIVE",
        source: "ADMIN_MANUAL",
        admin_note: adminNote || null,
        created_by: user?.id ?? null,
    });

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
}

export async function deleteStrike(strikeId: string) {
    const supabase = await createClient();

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
        throw new Error(userError.message);
    }

    const { error } = await supabase
        .from("strikes")
        .update({
            status: "REMOVED",
            removed_at: new Date().toISOString(),
            removed_by: user?.id ?? null,
        })
        .eq("id", strikeId);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
}