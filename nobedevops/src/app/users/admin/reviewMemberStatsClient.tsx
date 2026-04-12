"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

export type MemberRecord = {
    id: number;
    name: string | null;
    role: string | null;
    auth_id: string | null;
    illinois_email: string | null;
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
    const [search, setSearch] = useState("");
    const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

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

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.12),_transparent_26%),linear-gradient(180deg,_#08111f_0%,_#0b1324_100%)] text-slate-100">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
                <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-slate-950/30 backdrop-blur">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Admin review</p>
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Member attendance stats</h1>
                            <p className="max-w-2xl text-sm leading-6 text-slate-300">
                                Search a member by name or Illinois email to review attended events, unexcused misses, and overall attendance percentage.
                            </p>
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
                            <span className="block text-xs uppercase tracking-[0.28em] text-slate-400">Loaded records</span>
                            <span className="mt-1 block text-lg font-semibold text-white">
                                {members.length} members · {events.length} events
                            </span>
                        </div>
                    </div>
                </header>

                {loadError ? (
                    <section className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                        Unable to load every data source cleanly: {loadError}
                    </section>
                ) : null}

                <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                    <aside className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-xl shadow-slate-950/25 backdrop-blur">
                        <label className="block space-y-2">
                            <span className="text-sm font-medium text-slate-200">Search member</span>
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search name or email"
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/8"
                            />
                        </label>

                        <div className="mt-5 flex items-center justify-between text-xs uppercase tracking-[0.28em] text-slate-400">
                            <span>Matches</span>
                            <span>{filteredMembers.length}</span>
                        </div>

                        <div className="mt-3 max-h-[28rem] space-y-2 overflow-auto pr-1">
                            {filteredMembers.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                                    No members match that search.
                                </div>
                            ) : (
                                filteredMembers.map((member) => {
                                    const isSelected = member.id === selectedMemberId;

                                    return (
                                        <button
                                            key={member.id}
                                            type="button"
                                            onClick={() => setSelectedMemberId(member.id)}
                                            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${isSelected
                                                    ? "border-cyan-400/50 bg-cyan-400/10 shadow-lg shadow-cyan-950/20"
                                                    : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-medium text-white">{member.name ?? "Unnamed member"}</p>
                                                    <p className="mt-1 text-sm text-slate-300">{member.illinois_email ?? "No email on file"}</p>
                                                </div>
                                                <span className="rounded-full bg-black/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200">
                                                    {member.role ?? "Member"}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </aside>

                    <section className="space-y-6">
                        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-slate-950/25 backdrop-blur">
                            {selectedMember ? (
                                <>
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Selected member</p>
                                            <h2 className="mt-2 text-2xl font-semibold text-white">{selectedMember.name ?? "Unnamed member"}</h2>
                                            <p className="mt-1 text-sm text-slate-300">{selectedMember.illinois_email ?? "No email on file"}</p>
                                        </div>

                                        <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
                                            <span className="block text-xs uppercase tracking-[0.28em] text-slate-400">Status</span>
                                            <span className={`mt-1 block text-lg font-semibold ${thresholdReached ? "text-rose-300" : "text-emerald-300"}`}>
                                                {thresholdReached ? "3+ unexcused misses" : "Below threshold"}
                                            </span>
                                        </div>
                                    </div>

                                    {selectedStats ? (
                                        <>
                                            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                                <StatCard label="Attendance percentage" value={formatPercentage(selectedStats.attendancePercentage)} tone="cyan" />
                                                <StatCard label="Attended events" value={String(selectedStats.attendedEvents.length)} tone="emerald" />
                                                <StatCard label="Excused absences" value={String(selectedStats.excusedAbsenceCount)} tone="amber" />
                                                <StatCard label="Unexcused misses" value={String(selectedStats.unexcusedMissedEvents)} tone={thresholdReached ? "rose" : "slate"} />
                                            </div>

                                            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                                                <InfoPanel title="Attendance summary" description="Computed from past events only.">
                                                    <SummaryRow label="Past events total" value={String(selectedStats.totalPastEvents)} />
                                                    <SummaryRow label="Attendance rate" value={formatPercentage(selectedStats.attendancePercentage)} />
                                                    <SummaryRow label="Unexcused threshold" value={thresholdReached ? "Triggered" : "Not triggered"} />
                                                </InfoPanel>

                                                <InfoPanel title="Risk check" description="Members with 3 or more unexcused misses are highlighted here.">
                                                    {thresholdReached ? (
                                                        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                                                            This member has missed three or more events unexcused.
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                                                            This member is below the unexcused miss threshold.
                                                        </div>
                                                    )}
                                                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                                                        Members without an auth-linked profile cannot be matched to attendance rows.
                                                    </div>
                                                </InfoPanel>
                                            </div>

                                            <div className="mt-6 grid gap-4 xl:grid-cols-2">
                                                <InfoPanel title="Attended events" description={`${selectedStats.attendedEvents.length} event(s) attended`}>
                                                    <EventList events={selectedStats.attendedEvents} emptyText="No attended events found for this member yet." tone="emerald" />
                                                </InfoPanel>

                                                <InfoPanel title="Missed events" description={`${selectedStats.missedEvents.length} event(s) missed in total`}>
                                                    <EventList events={selectedStats.missedEvents} emptyText="No missed events found for this member yet." tone={thresholdReached ? "rose" : "amber"} />
                                                </InfoPanel>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-slate-300">
                                            This member does not have a linked auth account yet, so attendance cannot be matched from the attendance table.
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-slate-300">
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
    tone: "cyan" | "emerald" | "amber" | "rose" | "slate";
}) {
    const toneClasses = {
        cyan: "from-cyan-400/20 to-cyan-500/5 text-cyan-100 border-cyan-400/20",
        emerald: "from-emerald-400/20 to-emerald-500/5 text-emerald-100 border-emerald-400/20",
        amber: "from-amber-400/20 to-amber-500/5 text-amber-100 border-amber-400/20",
        rose: "from-rose-400/20 to-rose-500/5 text-rose-100 border-rose-400/20",
        slate: "from-slate-400/20 to-slate-500/5 text-slate-100 border-white/10",
    } as const;

    return (
        <article className={`rounded-2xl border bg-gradient-to-br p-4 ${toneClasses[tone]}`}>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-300/80">{label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
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
        <article className="rounded-3xl border border-white/10 bg-slate-950/45 p-5">
            <div className="space-y-1">
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                <p className="text-sm text-slate-400">{description}</p>
            </div>

            <div className="mt-4 space-y-3">{children}</div>
        </article>
    );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            <span className="text-slate-300">{label}</span>
            <span className="font-medium text-white">{value}</span>
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
    tone: "emerald" | "amber" | "rose";
}) {
    const emptyToneClasses = {
        emerald: "text-emerald-100 border-emerald-400/20 bg-emerald-500/10",
        amber: "text-amber-100 border-amber-400/20 bg-amber-500/10",
        rose: "text-rose-100 border-rose-400/20 bg-rose-500/10",
    } as const;

    if (events.length === 0) {
        return <div className={`rounded-2xl border p-4 text-sm ${emptyToneClasses[tone]}`}>{emptyText}</div>;
    }

    return (
        <ul className="space-y-2">
            {events.slice(0, 8).map((event) => (
                <li key={event.id} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <p className="font-medium text-white">{event.name ?? "Unnamed event"}</p>
                    <p className="mt-1 text-sm text-slate-400">{formatDate(event.date)}</p>
                </li>
            ))}
            {events.length > 8 ? <li className="text-xs text-slate-400">+{events.length - 8} more</li> : null}
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
