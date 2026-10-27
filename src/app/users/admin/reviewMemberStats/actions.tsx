"use server";

import { createClient } from "@/app/utils/supabase/server";
import { createAdminClient } from "@/app/utils/supabase/admin";
import { logAdminActivity } from "@/app/utils/activityLogger";
import { revalidatePath } from "next/cache";
import { getEventPointsForMember } from "@/app/utils/eventPoints";

export async function deleteMember(
    memberId: number,
    authId?: string | null,
    email?: string | null
) {
    const supabaseAdmin = createAdminClient();

    // 1. Fetch member record first to gather all identifiers (id, auth_id, illinois_email)
    let targetAuthId = authId || null;
    let targetEmail = email || null;

    const { data: memberRecord } = await supabaseAdmin
        .from("People")
        .select("id, auth_id, illinois_email, name, first_name, last_name")
        .eq("id", memberId)
        .maybeSingle();

    if (memberRecord) {
        if (!targetAuthId && memberRecord.auth_id) {
            targetAuthId = memberRecord.auth_id;
        }
        if (!targetEmail && memberRecord.illinois_email) {
            targetEmail = memberRecord.illinois_email;
        }
    }

    // 2. Identify all Supabase Auth user IDs to delete
    const authIdsToDelete = new Set<string>();
    if (targetAuthId) {
        authIdsToDelete.add(targetAuthId);
    }

    if (targetEmail) {
        try {
            const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
                page: 1,
                perPage: 1000,
            });
            const matchingAuthUser = listData?.users?.find(
                (u) => u.email?.toLowerCase().trim() === targetEmail!.toLowerCase().trim()
            );
            if (matchingAuthUser?.id) {
                authIdsToDelete.add(matchingAuthUser.id);
            }
        } catch (authListErr) {
            console.error("Error searching auth users by email:", authListErr);
        }
    }

    // 3. Delete attendance, absences, strikes across all associated auth user IDs
    for (const uid of authIdsToDelete) {
        await supabaseAdmin
            .from("strikes")
            .delete()
            .eq("user_id", uid);

        await supabaseAdmin
            .from("attendance")
            .delete()
            .eq("user_id", uid);

        await supabaseAdmin
            .from("excused_absences")
            .delete()
            .eq("user_id", uid);
    }

    // 4. Delete officer notes & manual points for this member
    await supabaseAdmin
        .from("SystemSettings")
        .delete()
        .in("key", [
            `officer_notes_member_id_${memberId}`,
            `manual_points_member_id_${memberId}`,
        ]);

    // 5. Delete member from People table
    const { error: deletePeopleError } = await supabaseAdmin
        .from("People")
        .delete()
        .eq("id", memberId);

    if (deletePeopleError) {
        throw new Error(deletePeopleError.message);
    }

    // Clean up any remaining rows in People that match target authId or email
    for (const uid of authIdsToDelete) {
        await supabaseAdmin
            .from("People")
            .delete()
            .eq("auth_id", uid);
    }
    if (targetEmail) {
        await supabaseAdmin
            .from("People")
            .delete()
            .ilike("illinois_email", targetEmail.trim());
    }

    // 6. Delete user(s) from Supabase Auth (auth.users)
    for (const uid of authIdsToDelete) {
        try {
            const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(uid);
            if (authDeleteError) {
                console.error(`Failed to delete auth user ${uid}:`, authDeleteError.message);
            }
        } catch (authErr) {
            console.error(`Exception deleting auth user ${uid}:`, authErr);
        }
    }

    const memberName = memberRecord?.name || memberRecord?.first_name || targetEmail || "Member";
    await logAdminActivity({
        type: "drop",
        description: `${memberName} was dropped / permanently removed from roster`,
        member_id: String(memberId),
    });

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
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

    const { data: targetPerson } = await supabase
        .from("People")
        .select("role")
        .eq("auth_id", memberAuthId)
        .maybeSingle();

    if (targetPerson?.role?.toUpperCase() === "ADMIN") {
        throw new Error("Admins are exempt from point requirements and strikes.");
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

    // Accurately synchronize People.strikes with active strikes count
    const supabaseAdmin = createAdminClient();
    const { count: activeCount } = await supabaseAdmin
        .from("strikes")
        .select("*", { count: "exact", head: true })
        .eq("user_id", memberAuthId)
        .eq("status", "ACTIVE");

    await supabaseAdmin
        .from("People")
        .update({ strikes: activeCount ?? 0 })
        .eq("auth_id", memberAuthId);

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
    revalidatePath("/users/member");
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

    // Get strike user_id first
    const { data: strikeData } = await supabase
        .from("strikes")
        .select("user_id")
        .eq("id", strikeId)
        .maybeSingle();

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

    // Accurately synchronize People.strikes with active strikes count
    if (strikeData?.user_id) {
        const supabaseAdmin = createAdminClient();
        const { count: activeCount } = await supabaseAdmin
            .from("strikes")
            .select("*", { count: "exact", head: true })
            .eq("user_id", strikeData.user_id)
            .eq("status", "ACTIVE");

        await supabaseAdmin
            .from("People")
            .update({ strikes: activeCount ?? 0 })
            .eq("auth_id", strikeData.user_id);
    }

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
    revalidatePath("/users/member");
}

export async function updateMemberPoints(memberId: number, category: "professional" | "social" | "service", amount: number) {
    const supabaseAdmin = createAdminClient();

    const { data: member, error: fetchError } = await supabaseAdmin
        .from("People")
        .select("id, auth_id, professional_points, social_points, service_points")
        .eq("id", memberId)
        .single();

    if (fetchError || !member) {
        throw new Error(fetchError?.message || "Member not found");
    }

    // 1. Fetch current manual points setting for this member
    const settingKey = `manual_points_member_id_${memberId}`;
    const { data: settingRow } = await supabaseAdmin
        .from("SystemSettings")
        .select("key, value")
        .eq("key", settingKey)
        .maybeSingle();

    let manualPoints = { professional: 0, social: 0, service: 0 };
    if (settingRow?.value) {
        try {
            const parsed = JSON.parse(settingRow.value);
            manualPoints = {
                professional: Number(parsed.professional) || 0,
                social: Number(parsed.social) || 0,
                service: Number(parsed.service) || 0,
            };
        } catch {
            // default
        }
    }

    // Update manual points for this category
    manualPoints[category] = (manualPoints[category] || 0) + amount;

    // Save updated manual points in SystemSettings
    const { error: saveSettingError } = await supabaseAdmin
        .from("SystemSettings")
        .upsert({
            key: settingKey,
            value: JSON.stringify(manualPoints),
            updated_at: new Date().toISOString(),
        });

    if (saveSettingError) {
        console.error("Failed to persist manual points setting:", saveSettingError);
    }

    // Update People points
    let updateField = "";
    if (category === "professional") {
        updateField = "professional_points";
    } else if (category === "social") {
        updateField = "social_points";
    } else if (category === "service") {
        updateField = "service_points";
    }

    const currentPoints = (member as any)[updateField] ?? 0;
    const newPoints = Math.max(currentPoints + amount, 0);

    const { error: updateError } = await supabaseAdmin
        .from("People")
        .update({ [updateField]: newPoints })
        .eq("id", memberId);

    if (updateError) {
        throw new Error(updateError.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
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
    const supabaseAdmin = createAdminClient();

    const normalizedRole = role.trim().toUpperCase();

    const { data: person } = await supabaseAdmin
        .from("People")
        .select("auth_id")
        .eq("id", memberId)
        .maybeSingle();

    if (normalizedRole === "ADMIN") {
        // Admins are officers and exempt from strikes - clear any strikes count and active strikes
        const { error } = await supabaseAdmin
            .from("People")
            .update({ role: normalizedRole, strikes: 0 })
            .eq("id", memberId);

        if (error) {
            throw new Error(error.message);
        }

        if (person?.auth_id) {
            await supabaseAdmin
                .from("strikes")
                .update({
                    status: "REMOVED",
                    removed_at: new Date().toISOString(),
                    admin_note: "Member promoted to Admin (exempt from strikes).",
                })
                .eq("user_id", person.auth_id)
                .eq("status", "ACTIVE");
        }
    } else {
        // Synchronize strikes count from active strikes
        let activeCount = 0;
        if (person?.auth_id) {
            const { count } = await supabaseAdmin
                .from("strikes")
                .select("*", { count: "exact", head: true })
                .eq("user_id", person.auth_id)
                .eq("status", "ACTIVE");
            activeCount = count ?? 0;
        }

        const { error } = await supabaseAdmin
            .from("People")
            .update({ role: normalizedRole, strikes: activeCount })
            .eq("id", memberId);

        if (error) {
            throw new Error(error.message);
        }
    }

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
    revalidatePath("/users/member");
}

export async function deactivateMember(memberId: number) {
    const supabase = await createClient();

    const { data: memberRecord } = await supabase
        .from("People")
        .select("name, first_name, last_name")
        .eq("id", memberId)
        .maybeSingle();
    const memberName = memberRecord?.first_name ? `${memberRecord.first_name} ${memberRecord.last_name || ""}`.trim() : memberRecord?.name || "Member";

    const { data: { user } } = await supabase.auth.getUser();
    let adminName = "Admin";
    if (user?.id) {
        const { data: adminPerson } = await supabase
            .from("People")
            .select("name, first_name")
            .eq("auth_id", user.id)
            .maybeSingle();
        adminName = adminPerson?.first_name || adminPerson?.name || "Admin";
    }

    const { error } = await supabase
        .from("People")
        .update({ auth_id: null })
        .eq("id", memberId);

    if (error) {
        throw new Error(error.message);
    }

    await logAdminActivity({
        type: "drop",
        description: `${memberName} was dropped / deactivated from member portal by ${adminName}`,
        admin_id: user?.id,
        admin_name: adminName,
        member_id: String(memberId),
    });

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
}

export async function updateAbsenceStatus(absenceId: string, status: "APPROVED" | "REJECTED") {
    const supabaseAdmin = createAdminClient();

    const { data: absence, error: fetchError } = await supabaseAdmin
        .from("excused_absences")
        .select("id, user_id, event_id, status")
        .eq("id", absenceId)
        .maybeSingle();

    if (fetchError || !absence) {
        throw new Error(fetchError?.message || "Absence request not found");
    }

    let eventData: {
        id: string;
        name?: string | null;
        points: number | null;
        event_type: string | null;
        is_mandatory: boolean | null;
        description?: string | null;
    } | null = null;

    if (absence.event_id) {
        const { data } = await supabaseAdmin
            .from("events")
            .select("id, name, points, event_type, is_mandatory, description")
            .eq("id", absence.event_id)
            .maybeSingle();
        eventData = data;
    }

    if (status === "APPROVED" && absence.event_id && absence.user_id) {
        const { data: existingAttendance } = await supabaseAdmin
            .from("attendance")
            .select("id")
            .eq("user_id", absence.user_id)
            .eq("event_id", absence.event_id)
            .maybeSingle();

        const { data: profile } = await supabaseAdmin
            .from("People")
            .select("professional_points, service_points, social_points, is_new_member")
            .eq("auth_id", absence.user_id)
            .maybeSingle();

        const eventPoints = getEventPointsForMember(eventData, profile?.is_new_member);
        const eventType = eventData?.event_type ?? null;

        if (!existingAttendance) {
            await supabaseAdmin
                .from("attendance")
                .insert({
                    user_id: absence.user_id,
                    event_id: absence.event_id,
                    timestamp: new Date().toISOString(),
                    points_awarded: eventPoints,
                    point_type: eventType,
                });

            if (eventPoints > 0 && eventType && profile) {
                const updates: Record<string, number> = {};
                const normType = eventType.toUpperCase();

                if (normType.includes("PROF")) {
                    updates.professional_points = (profile.professional_points ?? 0) + eventPoints;
                } else if (normType.includes("SERV")) {
                    updates.service_points = (profile.service_points ?? 0) + eventPoints;
                } else if (normType.includes("SOCI")) {
                    updates.social_points = (profile.social_points ?? 0) + eventPoints;
                }

                if (Object.keys(updates).length > 0) {
                    await supabaseAdmin
                        .from("People")
                        .update(updates)
                        .eq("auth_id", absence.user_id);
                }
            }
        }

        // If a strike was generated for this missed mandatory event, remove it and decrement People.strikes
        const { data: existingStrikes } = await supabaseAdmin
            .from("strikes")
            .select("id")
            .eq("user_id", absence.user_id)
            .eq("event_id", absence.event_id)
            .eq("status", "ACTIVE");

        if (existingStrikes && existingStrikes.length > 0) {
            await supabaseAdmin
                .from("strikes")
                .update({
                    status: "REMOVED",
                    removed_at: new Date().toISOString(),
                    admin_note: "Absence approved by admin.",
                })
                .eq("user_id", absence.user_id)
                .eq("event_id", absence.event_id);

            const { count: activeCount } = await supabaseAdmin
                .from("strikes")
                .select("*", { count: "exact", head: true })
                .eq("user_id", absence.user_id)
                .eq("status", "ACTIVE");

            await supabaseAdmin
                .from("People")
                .update({ strikes: activeCount ?? 0 })
                .eq("auth_id", absence.user_id);
        }
    } else if (status === "REJECTED" && absence.status?.toUpperCase() === "APPROVED" && absence.event_id && absence.user_id) {
        const { data: existingAttendance } = await supabaseAdmin
            .from("attendance")
            .select("id, points_awarded, point_type")
            .eq("user_id", absence.user_id)
            .eq("event_id", absence.event_id)
            .maybeSingle();

        if (existingAttendance) {
            await supabaseAdmin
                .from("attendance")
                .delete()
                .eq("id", existingAttendance.id);

            const { data: profile } = await supabaseAdmin
                .from("People")
                .select("professional_points, service_points, social_points, is_new_member")
                .eq("auth_id", absence.user_id)
                .maybeSingle();

            const pointsToDeduct = existingAttendance.points_awarded ?? getEventPointsForMember(eventData, profile?.is_new_member);
            const eventType = existingAttendance.point_type ?? eventData?.event_type;

            if (pointsToDeduct > 0 && eventType && profile) {
                const updates: Record<string, number> = {};
                const normType = eventType.toUpperCase();

                if (normType.includes("PROF")) {
                    updates.professional_points = Math.max(0, (profile.professional_points ?? 0) - pointsToDeduct);
                } else if (normType.includes("SERV")) {
                    updates.service_points = Math.max(0, (profile.service_points ?? 0) - pointsToDeduct);
                } else if (normType.includes("SOCI")) {
                    updates.social_points = Math.max(0, (profile.social_points ?? 0) - pointsToDeduct);
                }

                if (Object.keys(updates).length > 0) {
                    await supabaseAdmin
                        .from("People")
                        .update(updates)
                        .eq("auth_id", absence.user_id);
                }
            }
        }
    }

    const { data: { user } } = await supabaseAdmin.auth.getUser();
    let adminName = "Admin";
    if (user?.id) {
        const { data: adminPerson } = await supabaseAdmin
            .from("People")
            .select("name, first_name")
            .eq("auth_id", user.id)
            .maybeSingle();
        adminName = adminPerson?.first_name || adminPerson?.name || "Admin";
    }

    const { error } = await supabaseAdmin
        .from("excused_absences")
        .update({
            status,
            reviewed_at: new Date().toISOString(),
            reviewed_by: user?.id || null,
        })
        .eq("id", absenceId);

    if (error) {
        throw new Error(error.message);
    }

    if (status === "APPROVED") {
        const { data: memberPerson } = await supabaseAdmin
            .from("People")
            .select("name, first_name, last_name")
            .eq("auth_id", absence.user_id)
            .maybeSingle();
        const memberName = memberPerson?.first_name
            ? `${memberPerson.first_name} ${memberPerson.last_name || ""}`.trim()
            : memberPerson?.name || "Member";

        await logAdminActivity({
            type: "drop",
            description: `${memberName} dropped from "${eventData?.name || "Event"}" (Excuse approved by ${adminName})`,
            admin_id: user?.id,
            admin_name: adminName,
            event_id: absence.event_id,
            member_id: absence.user_id,
        });
    }

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
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
        role?: string;
        is_PM?: boolean;
        is_new_member?: boolean;
    }
) {
    const supabase = await createClient();

    const updateData: {
        name: string;
        illinois_email: string;
        major: string;
        year: string;
        college: string;
        committee: string;
        role?: string;
        is_PM?: boolean;
        is_new_member?: boolean;
    } = {
        name: payload.name.trim(),
        illinois_email: payload.illinois_email.trim(),
        major: payload.major.trim(),
        year: payload.year.trim(),
        college: payload.college.trim(),
        committee: payload.committee.trim(),
    };

    if (payload.role) {
        updateData.role = payload.role.trim().toUpperCase();
    }

    if (typeof payload.is_PM === "boolean") {
        updateData.is_PM = payload.is_PM;
    }

    if (typeof payload.is_new_member === "boolean") {
        updateData.is_new_member = payload.is_new_member;
    }

    let { error } = await supabase
        .from("People")
        .update(updateData)
        .eq("id", memberId);

    // If the is_new_member column does not exist yet in Supabase, retry without it
    if (error && error.message?.includes("is_new_member")) {
        delete updateData.is_new_member;
        const retry = await supabase
            .from("People")
            .update(updateData)
            .eq("id", memberId);
        error = retry.error;
    }

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
}

export async function updateMemberIsPM(memberId: number, is_PM: boolean) {
    const supabaseAdmin = createAdminClient();

    const { error } = await supabaseAdmin
        .from("People")
        .update({ is_PM })
        .eq("id", memberId);

    if (error) {
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
}

export async function updateMemberIsNewMember(memberId: number, is_new_member: boolean) {
    const supabaseAdmin = createAdminClient();

    const { error } = await supabaseAdmin
        .from("People")
        .update({ is_new_member })
        .eq("id", memberId);

    if (error) {
        if (error.message?.includes("is_new_member")) {
            throw new Error(
                "The 'is_new_member' column does not exist in the database yet. Please run this SQL in Supabase: ALTER TABLE \"People\" ADD COLUMN IF NOT EXISTS is_new_member BOOLEAN DEFAULT false;"
            );
        }
        throw new Error(error.message);
    }

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
}

export async function refreshAllMemberPoints() {
    const supabaseAdmin = createAdminClient();

    // 1. Fetch all events
    const { data: events, error: eventsErr } = await supabaseAdmin
        .from("events")
        .select("id, name, points, event_type, description");

    if (eventsErr || !events) {
        throw new Error(eventsErr?.message || "Failed to load events");
    }

    // 2. Fetch all attendance records
    const { data: attendance, error: attErr } = await supabaseAdmin
        .from("attendance")
        .select("id, user_id, event_id, points_awarded, point_type");

    if (attErr || !attendance) {
        throw new Error(attErr?.message || "Failed to load attendance");
    }

    // 3. Fetch all members
    const { data: people, error: peopleErr } = await supabaseAdmin
        .from("People")
        .select("id, auth_id, name, role, strikes, professional_points, social_points, service_points, is_new_member");

    if (peopleErr || !people) {
        throw new Error(peopleErr?.message || "Failed to load members");
    }

    // 4. Fetch all active strikes to synchronize People.strikes
    const { data: allActiveStrikes } = await supabaseAdmin
        .from("strikes")
        .select("user_id")
        .eq("status", "ACTIVE");

    const activeStrikesMap = new Map<string, number>();
    for (const s of (allActiveStrikes || [])) {
        if (s.user_id) {
            activeStrikesMap.set(s.user_id, (activeStrikesMap.get(s.user_id) || 0) + 1);
        }
    }

    // Ensure events with missing points are updated if they are professional/social workshops
    const eventsToUpdate = events.filter(
        (e) =>
            (e.points === 0 || e.points === null) &&
            ["PROFESSIONAL", "SOCIAL", "SERVICE"].includes((e.event_type || "").toUpperCase())
    );
    for (const evt of eventsToUpdate) {
        await supabaseAdmin
            .from("events")
            .update({ points: 1 })
            .eq("id", evt.id);
        evt.points = 1;
    }

    const eventMap = new Map<string, (typeof events)[0]>();
    for (const e of events) {
        eventMap.set(e.id, e);
    }

    const peopleMap = new Map<string, (typeof people)[0]>();
    for (const p of people) {
        if (p.auth_id) {
            peopleMap.set(p.auth_id, p);
        }
    }

    // Update attendance rows where points_awarded or point_type is missing or inaccurate
    const attendanceUpdates = [];
    for (const att of attendance) {
        if (!att.event_id) continue;
        const evt = eventMap.get(att.event_id);
        if (!evt) continue;

        const isPointBearing = ["PROFESSIONAL", "SOCIAL", "SERVICE"].includes((evt.event_type || "").toUpperCase());
        if (isPointBearing) {
            const person = att.user_id ? peopleMap.get(att.user_id) : undefined;
            const expectedPoints = getEventPointsForMember(evt, person?.is_new_member);
            const expectedType = evt.event_type;
            if (att.points_awarded !== expectedPoints || att.point_type !== expectedType) {
                attendanceUpdates.push(
                    supabaseAdmin
                        .from("attendance")
                        .update({
                            points_awarded: expectedPoints,
                            point_type: expectedType,
                        })
                        .eq("id", att.id)
                );
            }
        }
    }
    if (attendanceUpdates.length > 0) {
        await Promise.all(attendanceUpdates);
    }

    // 4. Fetch all manual points settings from SystemSettings
    const { data: manualSettingsRows } = await supabaseAdmin
        .from("SystemSettings")
        .select("key, value")
        .like("key", "manual_points_member_id_%");

    const manualPointsMap = new Map<number, { professional: number; social: number; service: number }>();
    if (manualSettingsRows) {
        for (const row of manualSettingsRows) {
            const memberIdStr = row.key.replace("manual_points_member_id_", "");
            const memberId = parseInt(memberIdStr, 10);
            if (!isNaN(memberId)) {
                try {
                    const parsed = JSON.parse(row.value);
                    manualPointsMap.set(memberId, {
                        professional: Number(parsed.professional) || 0,
                        social: Number(parsed.social) || 0,
                        service: Number(parsed.service) || 0,
                    });
                } catch {
                    // Ignore parse error
                }
            }
        }
    }

    // 5. Update people points to align with attendance breakdown + admin manual points
    let updatedCount = 0;
    const peopleUpdates = [];
    for (const person of people) {
        if (!person.auth_id) continue;

        const attendedEventIds = new Set(
            attendance
                .filter((row) => row.user_id === person.auth_id && row.event_id)
                .map((row) => row.event_id as string)
        );

        const attendedEventList = events.filter((e) => attendedEventIds.has(e.id));

        const profEvents = attendedEventList.filter(
            (e) => (e.event_type || "").toUpperCase() === "PROFESSIONAL" || (e.event_type || "").toUpperCase().includes("PROF")
        );
        const socEvents = attendedEventList.filter(
            (e) => (e.event_type || "").toUpperCase() === "SOCIAL" || (e.event_type || "").toUpperCase().includes("SOCI")
        );
        const servEvents = attendedEventList.filter(
            (e) => (e.event_type || "").toUpperCase().includes("SERVICE") || (e.event_type || "").toUpperCase().includes("SERV")
        );

        const isNew = Boolean(person.is_new_member);
        const breakdownProf = profEvents.reduce((sum, e) => sum + getEventPointsForMember(e, isNew), 0);
        const breakdownSoc = socEvents.reduce((sum, e) => sum + getEventPointsForMember(e, isNew), 0);
        const breakdownServ = servEvents.reduce((sum, e) => sum + getEventPointsForMember(e, isNew), 0);

        const manual = manualPointsMap.get(person.id) || { professional: 0, social: 0, service: 0 };

        const newProf = Math.max(0, breakdownProf + (manual.professional || 0));
        const newSoc = Math.max(0, breakdownSoc + (manual.social || 0));
        const newServ = Math.max(0, breakdownServ + (manual.service || 0));

        const curProf = person.professional_points ?? 0;
        const curSoc = person.social_points ?? 0;
        const curServ = person.service_points ?? 0;
        const curStrikes = person.strikes ?? 0;

        const expectedStrikes = (person.role?.toUpperCase() === "ADMIN")
            ? 0
            : (person.auth_id ? (activeStrikesMap.get(person.auth_id) || 0) : 0);

        if (curProf !== newProf || curSoc !== newSoc || curServ !== newServ || curStrikes !== expectedStrikes) {
            updatedCount++;
            peopleUpdates.push(
                supabaseAdmin
                    .from("People")
                    .update({
                        professional_points: newProf,
                        social_points: newSoc,
                        service_points: newServ,
                        strikes: expectedStrikes,
                    })
                    .eq("id", person.id)
            );
        }
    }

    if (peopleUpdates.length > 0) {
        await Promise.all(peopleUpdates);
    }

    revalidatePath("/users/admin/reviewMemberStats");
    revalidatePath("/users/admin");
    revalidatePath("/users/member");

    return {
        success: true,
        updatedCount,
        totalMembers: people.length,
    };
}