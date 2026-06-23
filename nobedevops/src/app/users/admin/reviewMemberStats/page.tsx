import { createClient } from "@/app/utils/supabase/server";
import AdminGuard from "../AdminGuard";
import ReviewMemberStatsClient, {
    type AbsenceRecord,
    type AttendanceRecord,
    type EventRecord,
    type MemberRecord,
    type StrikeRecord,
} from "../reviewMemberStatsClient";

export default async function ReviewMemberStats() {
    const supabase = await createClient();

    const [membersRes, eventsRes, attendanceRes, absencesRes, strikesRes] = await Promise.all([
        supabase
            .from("People")
            .select("id, name, role, auth_id, illinois_email, strikes")
            .order("name", { ascending: true }),
        supabase
            .from("events")
            .select("id, name, date")
            .order("date", { ascending: true }),
        supabase
            .from("attendance")
            .select("id, user_id, event_id, timestamp"),
        supabase
            .from("excused_absences")
            .select("id, user_id, event_id, status, reason, submitted_at"),
        supabase
            .from("strikes")
            .select("id, user_id, event_id, strike_type, reason, status, source, admin_note, created_at, created_by")
            .order("created_at", { ascending: false }),
    ]);

    const loadError =
        membersRes.error?.message ??
        eventsRes.error?.message ??
        attendanceRes.error?.message ??
        absencesRes.error?.message ??
        strikesRes.error?.message ??
        null;

    return (
        <AdminGuard>
            <ReviewMemberStatsClient
                members={(membersRes.data ?? []) as MemberRecord[]}
                events={(eventsRes.data ?? []) as EventRecord[]}
                attendance={(attendanceRes.data ?? []) as AttendanceRecord[]}
                absences={(absencesRes.data ?? []) as AbsenceRecord[]}
                strikes={(strikesRes.data ?? []) as StrikeRecord[]}
                loadError={loadError}
            />
        </AdminGuard>
    );
}
