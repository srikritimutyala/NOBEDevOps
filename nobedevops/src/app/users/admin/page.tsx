import { createClient } from "@/app/utils/supabase/server";
import AdminDashboard, { AttendanceRow } from "./adminDashboard";
import AdminGuard from "./AdminGuard";
import LogoutButton from "../login/logout";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type MemberRow = {
  id: number;
  name: string | null;
  auth_id: string | null;
};

type EventRow = {
  id: string;
  name: string | null;
  date: string | null;
};

type AttendanceDbRow = {
  id: string;
  user_id: string | null;
  event_id: string | null;
  timestamp: string | null;
};

type AbsenceRow = {
  id: string;
  user_id: string | null;
  status: string | null;
};

const EXCUSED_STATUSES = new Set(["APPROVED", "EXCUSED", "ACCEPTED", "CLEARED"]);



export default async function AdminPage() {
  const supabase = await createClient();

  let totalMembers: number | null = null;
  let totalAttendanceRecords: number | null = null;
  let attendanceRate: number | null = null;
  let atRiskMembers: number | null = null;
  let totalPastEvents: number | null = null;
  let recentAttendance: AttendanceRow[] = [];
  let attendanceError: string | null = null;

  const [membersRes, eventsRes, attendanceRes, absencesRes, recentRes] = await Promise.all([
    supabase
      .from("People")
      .select("id, name, auth_id"),
    supabase
      .from("events")
      .select("id, name, date"),
    supabase
      .from("attendance")
      .select("id, user_id, event_id, timestamp", { count: "exact" }),
    supabase
      .from("excused_absences")
      .select("id, user_id, status"),
    supabase
      .from("attendance")
      .select("id, user_id, event_id, timestamp")
      .order("timestamp", { ascending: false })
      .limit(8),
  ]);

  attendanceError =
    membersRes.error?.message ??
    eventsRes.error?.message ??
    attendanceRes.error?.message ??
    absencesRes.error?.message ??
    recentRes.error?.message ??
    null;

  const members = (membersRes.data ?? []) as MemberRow[];
  const events = (eventsRes.data ?? []) as EventRow[];
  const attendance = (attendanceRes.data ?? []) as AttendanceDbRow[];
  const absences = (absencesRes.data ?? []) as AbsenceRow[];

  totalMembers = members.length;
  totalAttendanceRecords = attendanceRes.count ?? attendance.length;

  const now = Date.now();
  const pastEvents = events.filter((event) => {
    const parsed = parseDate(event.date);
    return parsed !== null && parsed.getTime() <= now;
  });

  totalPastEvents = pastEvents.length;

  const authLinkedMembers = members.filter((member) => Boolean(member.auth_id));
  const attendancePairs = new Set(
    attendance
      .filter((row) => row.user_id && row.event_id)
      .map((row) => `${row.user_id}:${row.event_id}`)
  );

  const excusedAbsencesByUser = new Map<string, number>();
  for (const row of absences) {
    if (!row.user_id || !isExcusedStatus(row.status)) {
      continue;
    }

    excusedAbsencesByUser.set(row.user_id, (excusedAbsencesByUser.get(row.user_id) ?? 0) + 1);
  }

  let totalAttendedOpportunities = 0;
  let computedAtRiskMembers = 0;

  for (const member of authLinkedMembers) {
    const authId = member.auth_id as string;
    let attendedEvents = 0;

    for (const event of pastEvents) {
      if (attendancePairs.has(`${authId}:${event.id}`)) {
        attendedEvents += 1;
      }
    }

    const missedEvents = Math.max(pastEvents.length - attendedEvents, 0);
    const excusedCount = Math.min(excusedAbsencesByUser.get(authId) ?? 0, missedEvents);
    const unexcusedMisses = Math.max(missedEvents - excusedCount, 0);

    if (unexcusedMisses >= 3) {
      computedAtRiskMembers += 1;
    }

    totalAttendedOpportunities += attendedEvents;
  }

  const totalPossibleOpportunities = authLinkedMembers.length * pastEvents.length;
  attendanceRate =
    totalPossibleOpportunities === 0
      ? null
      : Math.round((totalAttendedOpportunities / totalPossibleOpportunities) * 1000) / 10;
  atRiskMembers = computedAtRiskMembers;

  const memberNameByAuthId = new Map(
    members
      .filter((member) => member.auth_id)
      .map((member) => [member.auth_id as string, member.name])
  );
  const eventNameById = new Map(events.map((event) => [event.id, event.name]));

  recentAttendance = ((recentRes.data ?? []) as AttendanceDbRow[]).map((row) => ({
    id: row.id,
    member_name: row.user_id ? memberNameByAuthId.get(row.user_id) ?? null : null,
    event_name: row.event_id ? eventNameById.get(row.event_id) ?? null : null,
    timestamp: row.timestamp,
  }));

  return (
    <AdminGuard>
      <div style={{ maxWidth: 520, margin: "40px auto" }}>
        <AdminDashboard
          totalMembers={totalMembers}
          totalAttendanceRecords={totalAttendanceRecords}
          attendanceRate={attendanceRate}
          atRiskMembers={atRiskMembers}
          totalPastEvents={totalPastEvents}
          recentAttendance={recentAttendance}
          attendanceError={attendanceError}
        />
        <div className="mx-auto max-w-6xl px-6 pb-10">
          <div className="rounded-lg border border-black/10 dark:border-white/20 p-6">
            <LogoutButton />
          </div>
        </div>
        <div className="flex flex-col  justify-center space-y-4">
          <Link href="/users/admin/bulkAdd">Go to Bulk Add</Link>
          <Link href="/users/admin/createEvent">Go to create event</Link>
          <Link href="/users/admin/reviewAbsence">Go to review absence</Link>
          <Link href="/users/admin/reviewMemberStats">Go to member stats</Link>
          <Link href="/users/admin/viewAllEvents">Go to view events</Link>
        </div>
      </div>
    </AdminGuard>
  );
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isExcusedStatus(status: string | null) {
  return typeof status === "string" && EXCUSED_STATUSES.has(status.trim().toUpperCase());
}
