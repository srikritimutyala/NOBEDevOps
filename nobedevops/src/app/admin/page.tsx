import { cookies } from "next/headers"
import AdminDashboard from "@/users/admin/admin"
import { createClient } from "@/utils/supabase/server"

type AttendanceRow = {
    id?: string | number
    member_name?: string | null
    status?: string | null
    created_at?: string | null
}

export default async function AdminPage() {
    const cookieStore = await cookies()
    const supabase = createClient(Promise.resolve(cookieStore))

    const [{ count: memberCount, error: memberError }, { count: attendanceCount, error: attendanceCountError }, recentAttendanceResult] =
        await Promise.all([
            supabase.from("People").select("*", { count: "exact", head: true }),
            supabase.from("Attendance").select("*", { count: "exact", head: true }),
            supabase
                .from("Attendance")
                .select("id, member_name, status, created_at")
                .order("created_at", { ascending: false })
                .limit(5),
        ])

    const totalMembers = memberError ? null : memberCount ?? 0
    const totalAttendanceRecords = attendanceCountError ? null : attendanceCount ?? 0

    const attendanceError = attendanceCountError?.message ?? recentAttendanceResult.error?.message ?? null

    const recentAttendance: AttendanceRow[] = recentAttendanceResult.error
        ? []
        : ((recentAttendanceResult.data as AttendanceRow[] | null) ?? [])

    return (
        <AdminDashboard
            totalMembers={totalMembers}
            totalAttendanceRecords={totalAttendanceRecords}
            recentAttendance={recentAttendance}
            attendanceError={attendanceError}
        />
    )
}
