import ProcessStrikesButton from "./processStrikesButton"

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
        <section className="page-stack">
            <header className="flex justify-between items-start">
                <div>
                    <img src="/nobe_logo_f.svg" alt="NOBE Illinois" style={{ width: '52px', height: '52px', marginBottom: '12px' }} />
                    <p className="eyebrow">Administration</p>
                    <h1 className="page-title" style={{ fontSize: '2.7rem' }}>Admin dashboard</h1>
                    <p className="page-subtitle"></p>
                </div>
                <div className="mt-8">
                    <ProcessStrikesButton />
                </div>
            </header>

            <section className="stats-grid">
                <StatCard label="Total Members" value={formatValue(totalMembers)} />
                <StatCard label="Attendance Records" value={formatValue(totalAttendanceRecords)} />
                <StatCard label="Attendance Rate" value={formatPercentage(attendanceRate)} />
                <StatCard label="At-Risk Members (3+ unexcused)" value={formatValue(atRiskMembers)} />
            </section>

            <section className="surface-grid two-up">
                <SummaryPanel
                    title="Coverage"
                    description="Computed from past events and members linked to auth accounts."
                    rows={[
                        { label: "Past events", value: formatValue(totalPastEvents) },
                        { label: "Attendance records", value: formatValue(totalAttendanceRecords) },
                        { label: "Overall attendance rate", value: formatPercentage(attendanceRate) },
                    ]}
                />
                <SummaryPanel
                    title="Risk"
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

            <section className="panel">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Recent Activity</p>
                        <h2 className="section-title">Attendance activity</h2>
                    </div>
                    <a href="/users/admin/reviewMemberStats" className="btn-secondary" style={{ fontSize: '0.85rem', minHeight: '36px', padding: '0 14px' }}>
                        View more
                    </a>
                </div>
                {attendanceError ? (
                    <p className="message-error">{attendanceError}</p>
                ) : recentAttendance.length === 0 ? (
                    <div className="empty-state">No attendance rows found yet.</div>
                ) : (
                    <ul className="list-stack">
                        {recentAttendance.map((row, index) => (
                            <li key={row.id ?? index} className="subtle-card">
                                <p><span className="font-medium">Member:</span> {row.member_name ?? "Unknown"}</p>
                                <p><span className="font-medium">Event:</span> {row.event_name ?? "Unknown event"}</p>
                                <p className="section-copy"><span className="font-medium">Recorded:</span> {formatTimestamp(row.timestamp ?? null)}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </section>
    )
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <article className="stat-card">
            <p className="stat-label">{label}</p>
            <p className="stat-value">{value}</p>
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
        <article className="panel">
            <h2 className="section-title">{title}</h2>
            <p className="section-copy">{description}</p>
            <div className="list-stack" style={{ marginTop: '16px' }}>
                {rows.map((row) => (
                    <div key={row.label} className="metric-pair">
                        <span>{row.label}</span>
                        <span>{row.value}</span>
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
