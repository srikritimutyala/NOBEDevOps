import { createClient } from "@/app/utils/supabase/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import AdminUI from "./adminUI";
import AdminGuard from "./AdminGuard";
import AdminDashboard, { AttendanceRow } from "./adminDashboard";
import LogoutButton from "../login/logout"
import BulkAddPage from "./bulkAdd/page";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Link from "next/link";



export default async function AdminPage() {
  const supabase = await createClient();

  let totalMembers: number | null = null;
  let totalAttendanceRecords: number | null = null;
  let recentAttendance: AttendanceRow[] = [];
  let attendanceError: string | null = null;

  const membersRes = await supabase
    .from("members")
    .select("*", { count: "exact", head: true });

  if (membersRes.error) {
    attendanceError = membersRes.error.message;
  } else {
    totalMembers = membersRes.count ?? 0;
  }

  const attendanceRes = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true });

  if (attendanceRes.error) {
    attendanceError = attendanceError ?? attendanceRes.error.message;
  } else {
    totalAttendanceRecords = attendanceRes.count ?? 0;
  }

  const recentRes = await supabase
    .from("attendance")
    .select("id, member_name, status, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  if (recentRes.error) {
    attendanceError = attendanceError ?? recentRes.error.message;
  } else {
    recentAttendance = (recentRes.data ?? []) as AttendanceRow[];
  }

  async function createEvent(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const name = String(formData.get("name") ?? "");
    const event_type = String(formData.get("event_type") ?? "");
    const points = Number(formData.get("points") ?? 0);
    const is_mandatory =
      String(formData.get("is_mandatory") ?? "false") === "true";
    const date = String(formData.get("date") ?? "");

    if (!name || !event_type || !date || Number.isNaN(points)) {
      throw new Error("Missing/invalid fields");
    }

    const qr_code_secret = randomBytes(32).toString("hex");

    const { error } = await supabase.from("events").insert({
      name,
      event_type,
      points,
      is_mandatory,
      date,
      qr_code_secret,
    });

    if (error) throw new Error(error.message);
  }

  return (
    <AdminGuard>
      <div style={{ maxWidth: 520, margin: "40px auto" }}>
        <AdminDashboard
          totalMembers={totalMembers}
          totalAttendanceRecords={totalAttendanceRecords}
          recentAttendance={recentAttendance}
          attendanceError={attendanceError}
        />
        <div className="mx-auto max-w-6xl px-6 pb-10">
          <div className="rounded-lg border border-black/10 dark:border-white/20 p-6">
            <AdminUI />
          </div>
            <div className="rounded-lg border border-black/10 dark:border-white/20 p-6">
            <LogoutButton />
          </div>
        </div>
        <div className = "flex flex-col  justify-center space-y-4">
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