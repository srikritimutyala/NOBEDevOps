export type AttendanceRow = {
    id?: string | number
    member_name?: string | null
    event_name?: string | null
    timestamp?: string | null
}

export type AdminDashboardProps = {
    totalMembers: number | null
    totalAttendanceRecords: number | null
    attendanceRate: number | null
    atRiskMembers: number | null
    totalPastEvents: number | null
    recentAttendance: AttendanceRow[]
    attendanceError?: string | null
}

export default function AdminDashboard({
    totalMembers,
    totalAttendanceRecords,
    attendanceRate,
    atRiskMembers,
    totalPastEvents,
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
                <StatCard label="Attendance Rate" value={formatPercentage(attendanceRate)} />
                <StatCard label="At-Risk Members (3+ unexcused)" value={formatValue(atRiskMembers)} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <SummaryPanel
                    title="Coverage Snapshot"
                    description="Computed from past events and members linked to auth accounts."
                    rows={[
                        { label: "Past events", value: formatValue(totalPastEvents) },
                        { label: "Attendance records", value: formatValue(totalAttendanceRecords) },
                        { label: "Overall attendance rate", value: formatPercentage(attendanceRate) },
                    ]}
                />
                <SummaryPanel
                    title="Risk Snapshot"
                    description="3 or more unexcused misses"
                    rows={[
                        { label: "At-risk members", value: formatValue(atRiskMembers) },
                        {
                            label: "Policy status",
                            value: atRiskMembers === null ? "N/A" : atRiskMembers > 0 ? "Action needed" : "No threshold reached",
                        },
                    ]}
                />
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
                                <p><span className="font-medium">Event:</span> {row.event_name ?? "Unknown event"}</p>
                                <p><span className="font-medium">Recorded:</span> {formatTimestamp(row.timestamp ?? null)}</p>
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

function SummaryPanel({
    title,
    description,
    rows,
}: {
    title: string
    description: string
    rows: Array<{ label: string; value: string }>
}) {
    return (
        <article className="rounded-lg border border-dashed border-black/20 dark:border-white/30 p-4 min-h-40 flex flex-col justify-between">
            <h2 className="text-lg font-medium">{title}</h2>
            <p className="text-sm opacity-75">{description}</p>
            <div className="mt-4 space-y-2">
                {rows.map((row) => (
                    <div key={row.label} className="rounded-md bg-black/5 dark:bg-white/10 px-3 py-2 flex items-center justify-between text-sm">
                        <span className="opacity-75">{row.label}</span>
                        <span className="font-medium">{row.value}</span>
                    </div>
                ))}
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

function formatPercentage(value: number | null) {
    if (value === null) {
        return "N/A"
    }

    return `${value.toFixed(1)}%`
}

function formatTimestamp(value: string | null) {
    if (!value) {
        return "N/A"
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return value
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date)
}
