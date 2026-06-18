"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type MemberRecord = {
    id: number;
    name: string | null;
    role: string | null;
    auth_id: string | null;
    illinois_email: string | null;
    strikes?: number | null;
};

export type EventRecord = {
    id: string;
    name: string | null;
    date: string | null;
};

export type AttendanceRecord = {
    id: string;
    user_id: string | null;
    event_id: string | null;
    timestamp: string | null;
};

export type AbsenceRecord = {
    id: string;
    user_id: string | null;
    status: string | null;
    reason: string | null;
    submitted_at: string | null;
};

type ReviewMemberStatsClientProps = {
    members: MemberRecord[];
    events: EventRecord[];
    attendance: AttendanceRecord[];
    absences: AbsenceRecord[];
    loadError: string | null;
};

type MemberStats = {
    totalPastEvents: number;
    attendedEvents: EventRecord[];
    missedEvents: EventRecord[];
    excusedAbsenceCount: number;
    unexcusedMissedEvents: number;
    attendancePercentage: number | null;
};

const excusedStatuses = new Set(["APPROVED", "EXCUSED", "ACCEPTED", "CLEARED"]);

export default function ReviewMemberStatsClient({
    members,
    events,
    attendance,
    absences,
    loadError,
}: ReviewMemberStatsClientProps) {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

    // Strike form state
    const [isStrikeFormOpen, setIsStrikeFormOpen] = useState(false);
    const [strikeType, setStrikeType] = useState<"MISSED_MANDATORY_EVENT" | "MANUAL_ADJUSTMENT">("MANUAL_ADJUSTMENT");
    const [reason, setReason] = useState("");
    const [selectedEventId, setSelectedEventId] = useState<string>("");
    const [adminNote, setAdminNote] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const filteredMembers = useMemo(() => {
        const query = search.trim().toLowerCase();

        if (!query) {
            return members;
        }

        return members.filter((member) => {
            const name = member.name?.toLowerCase() ?? "";
            const email = member.illinois_email?.toLowerCase() ?? "";
            return name.includes(query) || email.includes(query);
        });
    }, [members, search]);

    useEffect(() => {
        if (filteredMembers.length === 0) {
            setSelectedMemberId(null);
            return;
        }

        if (!selectedMemberId || !filteredMembers.some((member) => member.id === selectedMemberId)) {
            setSelectedMemberId(filteredMembers[0].id);
        }
    }, [filteredMembers, selectedMemberId]);

    const selectedMember = useMemo(
        () => members.find((member) => member.id === selectedMemberId) ?? null,
        [members, selectedMemberId]
    );

    const selectedStats = useMemo<MemberStats | null>(() => {
        if (!selectedMember?.auth_id) {
            return null;
        }

        const now = Date.now();
        const pastEvents = events
            .filter((event) => {
                const eventDate = parseDate(event.date);
                return eventDate !== null && eventDate.getTime() <= now;
            })
            .sort((left, right) => parseDate(left.date)!.getTime() - parseDate(right.date)!.getTime());

        const memberAttendance = new Set(
            attendance
                .filter((row) => row.user_id === selectedMember.auth_id && row.event_id)
                .map((row) => row.event_id as string)
        );

        const approvedAbsences = absences.filter(
            (row) => row.user_id === selectedMember.auth_id && isExcusedStatus(row.status)
        );

        const attendedEvents = pastEvents.filter((event) => memberAttendance.has(event.id));
        const missedEvents = pastEvents.filter((event) => !memberAttendance.has(event.id));
        const excusedAbsenceCount = Math.min(approvedAbsences.length, missedEvents.length);
        const unexcusedMissedEvents = Math.max(missedEvents.length - excusedAbsenceCount, 0);
        const attendancePercentage =
            pastEvents.length === 0 ? null : Math.round((attendedEvents.length / pastEvents.length) * 1000) / 10;

        return {
            totalPastEvents: pastEvents.length,
            attendedEvents,
            missedEvents,
            excusedAbsenceCount,
            unexcusedMissedEvents,
            attendancePercentage,
        };
    }, [attendance, events, absences, selectedMember]);

    const thresholdReached = (selectedStats?.unexcusedMissedEvents ?? 0) >= 3;

    const handleAddStrike = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMember?.auth_id) return;

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            const res = await fetch("/api/admin/strikes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: selectedMember.auth_id,
                    event_id: selectedEventId || null,
                    strike_type: strikeType,
                    reason,
                    admin_note: adminNote,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to add strike");

            setIsStrikeFormOpen(false);
            setReason("");
            setSelectedEventId("");
            setAdminNote("");
            router.refresh();
        } catch (err: any) {
            setSubmitError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="app-shell">
            <div className="page-frame flex w-full flex-col gap-6">
                <header className="rounded-[2rem] border border-[color:var(--border)] bg-[linear-gradient(145deg,rgba(229,138,39,0.12),rgba(255,251,247,0.88))] p-6 shadow-[0_28px_80px_rgba(79,80,82,0.12)] backdrop-blur">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-2">
                            <p className="eyebrow">Administration</p>
                            <h1 className="page-title" style={{ fontSize: "clamp(2.2rem,4vw,3.4rem)" }}>Member attendance stats</h1>
                            <p className="max-w-2xl text-sm leading-6 text-[color:var(--muted)]">
                                Search a member by name or Illinois email to review attended events, unexcused misses, and overall attendance percentage.
                            </p>
                        </div>

                        <div className="flex flex-col items-start gap-3 lg:items-end">
                            <Link href="/users/admin" className="btn-secondary">
                                Back to Admin
                            </Link>
                            <div className="rounded-2xl border border-[color:var(--border)] bg-[rgba(255,251,247,0.7)] px-4 py-3 text-sm text-[color:var(--muted)]">
                                <span className="block text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">Loaded records</span>
                                <span className="mt-1 block text-lg font-semibold text-[color:var(--foreground)]">
                                    {members.length} members · {events.length} events
                                </span>
                            </div>
                        </div>
                    </div>
                </header>

                {loadError ? (
                    <section className="message-error">
                        Unable to load every data source cleanly: {loadError}
                    </section>
                ) : null}

                <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                    <aside className="rounded-[2rem] border border-[color:var(--border)] bg-[rgba(255,251,247,0.7)] p-5 shadow-[0_24px_60px_rgba(79,80,82,0.1)] backdrop-blur">
                        <label className="block space-y-2">
                            <span className="text-sm font-medium text-[color:var(--foreground)]">Search member</span>
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search name or email"
                                className="w-full rounded-2xl border border-[color:var(--border)] bg-[rgba(255,251,247,0.92)] px-4 py-3 text-sm text-[color:var(--foreground)] outline-none transition placeholder:text-[color:var(--muted)] focus:border-[rgba(229,138,39,0.4)] focus:shadow-[0_0_0_4px_rgba(229,138,39,0.12)]"
                            />
                        </label>

                        <div className="mt-5 flex items-center justify-between text-xs uppercase tracking-[0.28em] text-[color:var(--muted)]">
                            <span>Matches</span>
                            <span>{filteredMembers.length}</span>
                        </div>

                        <div className="mt-3 max-h-[28rem] space-y-2 overflow-auto pr-1">
                            {filteredMembers.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-[color:var(--border-strong)] bg-[rgba(255,251,247,0.55)] p-4 text-sm text-[color:var(--muted)]">
                                    No members match that search.
                                </div>
                            ) : (
                                filteredMembers.map((member) => {
                                    const isSelected = member.id === selectedMemberId;

                                    return (
                                        <button
                                            key={member.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedMemberId(member.id);
                                                setIsStrikeFormOpen(false);
                                            }}
                                            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                                isSelected
                                                    ? "border-[rgba(229,138,39,0.35)] bg-[rgba(229,138,39,0.12)] shadow-[0_12px_30px_rgba(79,80,82,0.08)]"
                                                    : "border-[color:var(--border)] bg-[rgba(255,251,247,0.58)] hover:border-[rgba(229,138,39,0.22)] hover:bg-[rgba(255,251,247,0.88)]"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-medium text-[color:var(--foreground)]">{member.name ?? "Unnamed member"}</p>
                                                    <p className="mt-1 text-sm text-[color:var(--muted)]">{member.illinois_email ?? "No email on file"}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="rounded-full bg-[rgba(229,138,39,0.12)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-strong)]">
                                                        {member.role ?? "Member"}
                                                    </span>
                                                    {member.strikes ? (
                                                        <span className="rounded-full bg-[rgba(154,59,49,0.12)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9a3b31]">
                                                            {member.strikes} {member.strikes === 1 ? 'Strike' : 'Strikes'}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </aside>

                    <section className="space-y-6">
                        <div className="rounded-[2rem] border border-[color:var(--border)] bg-[linear-gradient(180deg,rgba(255,251,247,0.88),rgba(244,236,230,0.82))] p-6 shadow-[0_24px_60px_rgba(79,80,82,0.1)] backdrop-blur">
                            {selectedMember ? (
                                <>
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--accent)]">Selected member</p>
                                            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">{selectedMember.name ?? "Unnamed member"}</h2>
                                            <p className="mt-1 text-sm text-[color:var(--muted)]">{selectedMember.illinois_email ?? "No email on file"}</p>
                                        </div>

                                        <div className="flex flex-wrap gap-4">
                                            <div className={`rounded-2xl border px-4 py-3 text-sm ${
                                                (selectedMember.strikes ?? 0) > 0
                                                    ? "border-[rgba(154,59,49,0.2)] bg-[rgba(154,59,49,0.1)] text-[#7d2d25]"
                                                    : "border-[rgba(47,107,70,0.18)] bg-[rgba(47,107,70,0.1)] text-[#29583b]"
                                            }`}>
                                                <span className="block text-xs uppercase tracking-[0.28em] opacity-80">Strikes</span>
                                                <span className="mt-1 block text-lg font-semibold">
                                                    {selectedMember.strikes ?? 0} {selectedMember.strikes === 1 ? 'strike' : 'strikes'}
                                                </span>
                                            </div>
                                            <div className={`rounded-2xl border px-4 py-3 text-sm ${
                                                thresholdReached
                                                    ? "border-[rgba(154,59,49,0.2)] bg-[rgba(154,59,49,0.1)] text-[#7d2d25]"
                                                    : "border-[rgba(47,107,70,0.18)] bg-[rgba(47,107,70,0.1)] text-[#29583b]"
                                            }`}>
                                                <span className="block text-xs uppercase tracking-[0.28em] opacity-80">Status</span>
                                                <span className="mt-1 block text-lg font-semibold">
                                                    {thresholdReached ? "3+ unexcused misses" : "Below threshold"}
                                                </span>
                                            </div>
                                            <button 
                                                onClick={() => setIsStrikeFormOpen(!isStrikeFormOpen)}
                                                disabled={!selectedMember.auth_id}
                                                className={`rounded-2xl border px-6 py-3 text-sm font-semibold transition ${
                                                    isStrikeFormOpen 
                                                    ? "border-[color:var(--border-strong)] bg-[color:var(--background)] text-[color:var(--foreground)]"
                                                    : "border-[rgba(229,138,39,0.2)] bg-[rgba(229,138,39,0.1)] text-[color:var(--accent-strong)] hover:bg-[rgba(229,138,39,0.18)]"
                                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                                            >
                                                {isStrikeFormOpen ? "Cancel" : "Add manual strike"}
                                            </button>
                                        </div>
                                    </div>

                                    {isStrikeFormOpen && selectedMember.auth_id && (
                                        <div className="mt-8 rounded-3xl border border-[rgba(229,138,39,0.2)] bg-[rgba(229,138,39,0.04)] p-6 shadow-sm">
                                            <h3 className="text-lg font-semibold text-[color:var(--foreground)]">Manual strike form</h3>
                                            <p className="mt-1 text-sm text-[color:var(--muted)]">Add a manual strike record for {selectedMember.name}.</p>
                                            
                                            <form onSubmit={handleAddStrike} className="mt-6 grid gap-6 md:grid-cols-2">
                                                <div className="space-y-4">
                                                    <label className="block space-y-2">
                                                        <span className="text-sm font-medium text-[color:var(--foreground)]">Strike Type</span>
                                                        <select
                                                            value={strikeType}
                                                            onChange={(e) => setStrikeType(e.target.value as any)}
                                                            className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-3 text-sm outline-none focus:border-[color:var(--accent)]"
                                                            required
                                                        >
                                                            <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
                                                            <option value="MISSED_MANDATORY_EVENT">Missed Mandatory Event</option>
                                                        </select>
                                                    </label>

                                                    <label className="block space-y-2">
                                                        <span className="text-sm font-medium text-[color:var(--foreground)]">Linked Event (Optional)</span>
                                                        <select
                                                            value={selectedEventId}
                                                            onChange={(e) => setSelectedEventId(e.target.value)}
                                                            className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-3 text-sm outline-none focus:border-[color:var(--accent)]"
                                                        >
                                                            <option value="">None</option>
                                                            {events.map(event => (
                                                                <option key={event.id} value={event.id}>
                                                                    {event.name} ({formatDate(event.date)})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                </div>

                                                <div className="space-y-4">
                                                    <label className="block space-y-2">
                                                        <span className="text-sm font-medium text-[color:var(--foreground)]">Reason</span>
                                                        <textarea
                                                            value={reason}
                                                            onChange={(e) => setReason(e.target.value)}
                                                            placeholder="Why is this strike being issued?"
                                                            className="w-full h-[6.5rem] rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-3 text-sm outline-none focus:border-[color:var(--accent)] resize-none"
                                                            required
                                                        />
                                                    </label>

                                                    <label className="block space-y-2">
                                                        <span className="text-sm font-medium text-[color:var(--foreground)]">Admin Note (Private)</span>
                                                        <textarea
                                                            value={adminNote}
                                                            onChange={(e) => setAdminNote(e.target.value)}
                                                            placeholder="Internal notes about this strike..."
                                                            className="w-full h-[6.5rem] rounded-2xl border border-[color:var(--border)] bg-[color:var(--background)] px-4 py-3 text-sm outline-none focus:border-[color:var(--accent)] resize-none"
                                                        />
                                                    </label>
                                                </div>

                                                {submitError && (
                                                    <div className="md:col-span-2 text-sm text-[#9a3b31] bg-[rgba(154,59,49,0.08)] p-4 rounded-2xl border border-[rgba(154,59,49,0.2)]">
                                                        {submitError}
                                                    </div>
                                                )}

                                                <div className="md:col-span-2 flex justify-end gap-3 mt-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsStrikeFormOpen(false)}
                                                        className="px-6 py-2.5 rounded-2xl border border-[color:var(--border)] text-sm font-medium hover:bg-[color:var(--muted-soft)] transition"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="submit"
                                                        disabled={isSubmitting}
                                                        className="px-8 py-2.5 rounded-2xl bg-[color:var(--accent)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition shadow-sm"
                                                    >
                                                        {isSubmitting ? "Submitting..." : "Issue strike"}
                                                    </button>
                                                </div>
                                            </form>
                                        </div>
                                    )}

                                    {selectedStats ? (
                                        <>
                                            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                                <StatCard label="Attendance percentage" value={formatPercentage(selectedStats.attendancePercentage)} tone="accent" />
                                                <StatCard label="Attended events" value={String(selectedStats.attendedEvents.length)} tone="success" />
                                                <StatCard label="Excused absences" value={String(selectedStats.excusedAbsenceCount)} tone="soft" />
                                                <StatCard label="Unexcused misses" value={String(selectedStats.unexcusedMissedEvents)} tone={thresholdReached ? "danger" : "muted"} />
                                            </div>

                                            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                                                <InfoPanel title="Attendance summary" description="Computed from past events only.">
                                                    <SummaryRow label="Past events total" value={String(selectedStats.totalPastEvents)} />
                                                    <SummaryRow label="Attendance rate" value={formatPercentage(selectedStats.attendancePercentage)} />
                                                    <SummaryRow label="Unexcused threshold" value={thresholdReached ? "Triggered" : "Not triggered"} />
                                                </InfoPanel>

                                                <InfoPanel title="Risk check" description="Members with 3 or more unexcused misses are highlighted here.">
                                                    {thresholdReached ? (
                                                        <div className="message-error">
                                                            This member has missed three or more events unexcused.
                                                        </div>
                                                    ) : (
                                                        <div className="message-success">
                                                            This member is below the unexcused miss threshold.
                                                        </div>
                                                    )}
                                                    <div className="message">
                                                        Members without an auth-linked profile cannot be matched to attendance rows.
                                                    </div>
                                                </InfoPanel>
                                            </div>

                                            <div className="mt-6 grid gap-4 xl:grid-cols-2">
                                                <InfoPanel title="Attended events" description={`${selectedStats.attendedEvents.length} event(s) attended`}>
                                                    <EventList events={selectedStats.attendedEvents} emptyText="No attended events found for this member yet." tone="success" />
                                                </InfoPanel>

                                                <InfoPanel title="Missed events" description={`${selectedStats.missedEvents.length} event(s) missed in total`}>
                                                    <EventList events={selectedStats.missedEvents} emptyText="No missed events found for this member yet." tone={thresholdReached ? "danger" : "soft"} />
                                                </InfoPanel>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="mt-6 rounded-2xl border border-dashed border-[color:var(--border-strong)] bg-[rgba(255,251,247,0.55)] p-6 text-sm text-[color:var(--muted)]">
                                            This member does not have a linked auth account yet, so attendance cannot be matched from the attendance table.
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-[color:var(--border-strong)] bg-[rgba(255,251,247,0.55)] p-6 text-sm text-[color:var(--muted)]">
                                    Search for a member to see their attendance summary.
                                </div>
                            )}
                        </div>
                    </section>
                </section>
            </div>
        </main>
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
    return typeof status === "string" && excusedStatuses.has(status.trim().toUpperCase());
}

function formatPercentage(value: number | null) {
    if (value === null) {
        return "N/A";
    }

    return `${value.toFixed(1)}%`;
}

function StatCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone: "accent" | "success" | "soft" | "danger" | "muted";
}) {
    const toneClasses = {
        accent: "from-[rgba(229,138,39,0.18)] to-[rgba(229,138,39,0.04)] text-[color:var(--foreground)] border-[rgba(229,138,39,0.16)]",
        success: "from-[rgba(47,107,70,0.16)] to-[rgba(47,107,70,0.04)] text-[color:var(--foreground)] border-[rgba(47,107,70,0.16)]",
        soft: "from-[rgba(229,221,213,0.45)] to-[rgba(229,221,213,0.12)] text-[color:var(--foreground)] border-[rgba(229,138,39,0.12)]",
        danger: "from-[rgba(154,59,49,0.16)] to-[rgba(154,59,49,0.04)] text-[color:var(--foreground)] border-[rgba(154,59,49,0.16)]",
        muted: "from-[rgba(100,86,78,0.14)] to-[rgba(100,86,78,0.04)] text-[color:var(--foreground)] border-[color:var(--border)]",
    } as const;

    return (
        <article className={`rounded-2xl border bg-gradient-to-br p-4 ${toneClasses[tone]}`}>
            <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--muted)]">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--foreground)]">{value}</p>
        </article>
    );
}

function InfoPanel({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <article className="rounded-3xl border border-[color:var(--border)] bg-[rgba(255,251,247,0.62)] p-5">
            <div className="space-y-1">
                <h3 className="text-lg font-semibold text-[color:var(--foreground)]">{title}</h3>
                <p className="text-sm text-[color:var(--muted)]">{description}</p>
            </div>

            <div className="mt-4 space-y-3">{children}</div>
        </article>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--border)] bg-[rgba(255,251,247,0.65)] px-4 py-3 text-sm">
            <span className="text-[color:var(--muted)]">{label}</span>
            <span className="font-medium text-[color:var(--foreground)]">{value}</span>
        </div>
    );
}

function EventList({
    events,
    emptyText,
    tone,
}: {
    events: EventRecord[];
    emptyText: string;
    tone: "success" | "soft" | "danger";
}) {
    const emptyToneClasses = {
        success: "text-[#29583b] border-[rgba(47,107,70,0.18)] bg-[rgba(47,107,70,0.1)]",
        soft: "text-[color:var(--accent-strong)] border-[rgba(229,138,39,0.14)] bg-[rgba(229,221,213,0.28)]",
        danger: "text-[#7d2d25] border-[rgba(154,59,49,0.18)] bg-[rgba(154,59,49,0.1)]",
    } as const;

    if (events.length === 0) {
        return <div className={`rounded-2xl border p-4 text-sm ${emptyToneClasses[tone]}`}>{emptyText}</div>;
    }

    return (
        <ul className="space-y-2">
            {events.slice(0, 8).map((event) => (
                <li key={event.id} className="rounded-2xl border border-[color:var(--border)] bg-[rgba(255,251,247,0.65)] px-4 py-3">
                    <p className="font-medium text-[color:var(--foreground)]">{event.name ?? "Unnamed event"}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">{formatDate(event.date)}</p>
                </li>
            ))}
            {events.length > 8 ? <li className="text-xs text-[color:var(--muted)]">+{events.length - 8} more</li> : null}
        </ul>
    );
}

function formatDate(value: string | null) {
    const date = parseDate(value);

    if (!date) {
        return "Unknown date";
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
}

