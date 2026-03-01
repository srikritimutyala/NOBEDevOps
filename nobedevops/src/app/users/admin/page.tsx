import { createClient } from "@/app/utils/supabase/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import AdminDashboard, { AttendanceRow } from "./adminDashboard";

export default async function AdminPage() {

  // ✅ server-side supabase client
  const cookieStore = cookies()
  const supabase = createClient(Promise.resolve(cookieStore))

  // ✅ Fetch dashboard data (adjust table names if yours differ)
  let totalMembers: number | null = null
  let totalAttendanceRecords: number | null = null
  let recentAttendance: AttendanceRow[] = []
  let attendanceError: string | null = null

  // 1) total members
  const membersRes = await supabase
    .from("members")
    .select("*", { count: "exact", head: true })

  if (membersRes.error) {
    attendanceError = membersRes.error.message
  } else {
    totalMembers = membersRes.count ?? 0
  }

  // 2) total attendance records
  const attendanceRes = await supabase
    .from("attendance")
    .select("*", { count: "exact", head: true })

  if (attendanceRes.error) {
    attendanceError = attendanceError ?? attendanceRes.error.message
  } else {
    totalAttendanceRecords = attendanceRes.count ?? 0
  }

  // 3) recent attendance rows
  const recentRes = await supabase
    .from("attendance")
    .select("id, member_name, status, created_at")
    .order("created_at", { ascending: false })
    .limit(8)

  if (recentRes.error) {
    attendanceError = attendanceError ?? recentRes.error.message
  } else {
    recentAttendance = (recentRes.data ?? []) as AttendanceRow[]
  }






  async function createEvent(formData: FormData) {
    "use server";

    // Create per-request cookie store + supabase client
    const cookieStore = cookies();
    const supabase = createClient(Promise.resolve(cookieStore));






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
    <div style={{ maxWidth: 520, margin: "40px auto" }}>
      <AdminDashboard
        totalMembers={totalMembers}
        totalAttendanceRecords={totalAttendanceRecords}
        recentAttendance={recentAttendance}
        attendanceError={attendanceError}
      />
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>
        Create Event
      </h1>

      <form action={createEvent} style={{ display: "grid", gap: 12 }}>
        <label>
          Name
          <input name="name" required style={{ width: "100%", padding: 8 }} />
        </label>

        <label>
          Event type
          <select
            name="event_type"
            required
            style={{ width: "100%", padding: 8 }}
            >
            <option value="PROFESSIONAL">PROFESSIONAL</option>
            <option value="SOCIAL">SOCIAL</option>
            <option value="PHILANTHROPY">PHILANTHROPY</option>
            <option value="GENERAL_MEETING">GENERAL_MEETING</option>
            <option value="NEW_MEMBER_WORKSHOP">NEW_MEMBER_WORKSHOP</option>
            <option value="PROJECT_MEETING">PROJECT_MEETING</option>
            <option value="OTHER_MANDATORY">OTHER_MANDATORY</option>
            </select>
        </label>

        <label>
          Points
          <input
            type="number"
            name="points"
            required
            min={0}
            step={1}
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Date/time
          <input
            type="datetime-local"
            name="date"
            required
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Mandatory?
          <select name="is_mandatory" style={{ width: "100%", padding: 8 }}>
            <option value="false">false</option>
            <option value="true">true</option>
          </select>
        </label>

        <button type="submit" style={{ padding: 10, fontWeight: 600 }}>
          Create
        </button>
      </form>
    </div>
  );
}