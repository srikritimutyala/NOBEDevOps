export type AttendanceRow = {
    id?: string | number
    member_name?: string | null
    status?: string | null
    created_at?: string | null
}

export type AdminDashboardProps = {
    totalMembers: number | null
    totalAttendanceRecords: number | null
    recentAttendance: AttendanceRow[]
    attendanceError?: string | null
}

export default function AdminDashboard({
    totalMembers,
    totalAttendanceRecords,
    recentAttendance,
    attendanceError,
}: AdminDashboardProps) {
    return (
        <main className="mx-auto max-w-6xl p-6 space-y-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold">Administrator Dashboard</h1>
                <p className="text-sm opacity-80">Attendance tracking overview (Supabase-backed)</p>
            </header>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total Members" value={formatValue(totalMembers)} />
                <StatCard label="Attendance Records" value={formatValue(totalAttendanceRecords)} />
                <StatCard label="Attendance Rate" value="Placeholder" />
                <StatCard label="Late Arrivals" value="Placeholder" />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <PlaceholderPanel title="Attendance Trend Graph" description="Hook this up to chart data once attendance timestamps are finalized." />
                <PlaceholderPanel title="Member Attendance Distribution" description="Use this area for pie/bar chart visualizing attendance by status." />
            </section>

            <section className="rounded-lg border border-black/10 dark:border-white/20 p-4 space-y-3">
                <h2 className="text-lg font-medium">Recent Attendance Activity</h2>
                {attendanceError ? (
                    <p className="text-sm text-orange-600 dark:text-orange-300">{attendanceError}</p>
                ) : recentAttendance.length === 0 ? (
                    <p className="text-sm opacity-80">No attendance rows found yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {recentAttendance.map((row, index) => (
                            <li key={row.id ?? index} className="rounded-md border border-black/10 dark:border-white/20 p-3 text-sm">
                                <p><span className="font-medium">Member:</span> {row.member_name ?? "Unknown"}</p>
                                <p><span className="font-medium">Status:</span> {row.status ?? "N/A"}</p>
                                <p><span className="font-medium">Recorded:</span> {row.created_at ?? "N/A"}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </main>
    )
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <article className="rounded-lg border border-black/10 dark:border-white/20 p-4">
            <p className="text-sm opacity-80">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
        </article>
    )
}

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
    return (
        <article className="rounded-lg border border-dashed border-black/20 dark:border-white/30 p-4 min-h-40 flex flex-col justify-between">
            <h2 className="text-lg font-medium">{title}</h2>
            <p className="text-sm opacity-75">{description}</p>
            <div className="mt-4 h-24 rounded-md bg-black/5 dark:bg-white/10 grid place-items-center text-xs opacity-70">
                Graph Placeholder
            </div>
        </article>
    )
}

function formatValue(value: number | null) {
    if (value === null) {
        return "N/A"
    }

    return value.toLocaleString()
}
