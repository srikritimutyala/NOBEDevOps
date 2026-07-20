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

export async function updateMemberPoints(memberId: number, category: "professional" | "social" | "service", amount: number) {
    const supabase = await createClient();

    const { data: member, error: fetchError } = await supabase
        .from("People")
        .select("professional_points, social_points, service_points")
        .eq("id", memberId)
        .single();

    if (fetchError || !member) {
        throw new Error(fetchError?.message || "Member not found");
    }

    let newPoints = 0;
    let updateField = "";
    if (category === "professional") {
        newPoints = Math.max((member.professional_points || 0) + amount, 0);
        updateField = "professional_points";
    } else if (category === "social") {
        newPoints = Math.max((member.social_points || 0) + amount, 0);
        updateField = "social_points";
    } else if (category === "service") {
        newPoints = Math.max((member.service_points || 0) + amount, 0);
        updateField = "service_points";
    }

    const { error: updateError } = await supabase
        .from("People")
        .update({ [updateField]: newPoints })
        .eq("id", memberId);

    if (updateError) {
        throw new Error(updateError.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
}

export async function updateOfficerNotes(memberId: number, notes: string) {
    const supabase = await createClient();

    const key = `officer_notes_member_id_${memberId}`;
    const { error } = await supabase
        .from("SystemSettings")
        .upsert({ key, value: notes });

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
}

export async function updateMemberRole(memberId: number, role: string) {
    const supabase = await createClient();

    const { error } = await supabase
        .from("People")
        .update({ role })
        .eq("id", memberId);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
}

export async function deactivateMember(memberId: number) {
    const supabase = await createClient();

    const { error } = await supabase
        .from("People")
        .update({ auth_id: null })
        .eq("id", memberId);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
}

export async function updateAbsenceStatus(absenceId: string, status: "APPROVED" | "REJECTED") {
    const supabase = await createClient();

    const { error } = await supabase
        .from("excused_absences")
        .update({ status })
        .eq("id", absenceId);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
}

export async function editMemberDetails(
    memberId: number,
    payload: {
        name: string;
        illinois_email: string;
        major: string;
        year: string;
        college: string;
        committee: string;
    }
) {
    const supabase = await createClient();

    const { error } = await supabase
        .from("People")
        .update({
            name: payload.name.trim(),
            illinois_email: payload.illinois_email.trim(),
            major: payload.major.trim(),
            year: payload.year.trim(),
            college: payload.college.trim(),
            committee: payload.committee.trim(),
        })
        .eq("id", memberId);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
}