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