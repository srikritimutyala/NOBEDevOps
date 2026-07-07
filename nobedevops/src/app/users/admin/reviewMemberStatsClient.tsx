"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
    deleteMember,
    deleteStrike,
    updateMemberPoints,
    updateOfficerNotes,
    updateMemberRole,
    deactivateMember,
    updateAbsenceStatus,
    editMemberDetails,
} from "./reviewMemberStats/actions";

export type MemberRecord = {
    id: number;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    role: string | null;
    auth_id: string | null;
    illinois_email: string | null;
    strikes?: number | null;
    year: string | null;
    college: string | null;
    major: string | null;
    committee: string | null;
    professional_points: number | null;
    social_points: number | null;
    service_points: number | null;
    created_at: string | null;
    gcal_refresh_token?: string | null;
};

export type EventRecord = {
    id: string;
    name: string | null;
    date: string | null;
    event_type?: string | null;
    points?: number | null;
    is_mandatory?: boolean | null;
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
    event_id?: string | null;
    status: string | null;
    reason: string | null;
    submitted_at: string | null;
};

export type StrikeRecord = {
    id: string;
    user_id: string | null;
    event_id: string | null;
    strike_type: string;
    reason: string;
    status: string;
    source: string;
    admin_note: string | null;
    created_at: string | null;
    created_by: string | null;
};

export type SystemSettingRecord = {
    key: string;
    value: string;
};

type ReviewMemberStatsClientProps = {
    members: MemberRecord[];
    events: EventRecord[];
    attendance: AttendanceRecord[];
    absences: AbsenceRecord[];
    strikes: StrikeRecord[];
    systemSettings: SystemSettingRecord[];
    pointRequirements: {
        professional_goal: number;
        service_goal: number;
        social_goal: number;
    };
    loadError: string | null;
};

const excusedStatuses = new Set(["APPROVED", "EXCUSED", "ACCEPTED", "CLEARED"]);

export default function ReviewMemberStatsClient({
    members,
    events,
    attendance,
    absences,
    strikes,
    systemSettings,
    pointRequirements,
    loadError,
}: ReviewMemberStatsClientProps) {
    const [search, setSearch] = useState("");
    const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
    const [isPending, startTransition] = useTransition();
    const [actionError, setActionError] = useState<string | null>(null);
    
    // Notes editing state
    const [noteText, setNoteText] = useState("");
    const [noteSavedFeedback, setNoteSavedFeedback] = useState(false);

    // Edit Member Modal State
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editForm, setEditForm] = useState({
        name: "",
        illinois_email: "",
        major: "",
        year: "",
        college: "",
        committee: "",
    });

    const filteredMembers = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return members;
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
        if (!selectedMemberId || !filteredMembers.some((m) => m.id === selectedMemberId)) {
            setSelectedMemberId(filteredMembers[0].id);
        }
    }, [filteredMembers, selectedMemberId]);

    const selectedMember = useMemo(
        () => members.find((m) => m.id === selectedMemberId) ?? null,
        [members, selectedMemberId]
    );

    // Sync note text when selected member changes
    useEffect(() => {
        if (selectedMember) {
            const key = `officer_notes_member_id_${selectedMember.id}`;
            const existingNote = systemSettings.find((s) => s.key === key)?.value || "";
            setNoteText(existingNote);
            
            // populate edit form
            setEditForm({
                name: selectedMember.name || "",
                illinois_email: selectedMember.illinois_email || "",
                major: selectedMember.major || "",
                year: selectedMember.year || "",
                college: selectedMember.college || "",
                committee: selectedMember.committee || "",
            });
        }
    }, [selectedMember, systemSettings]);

    // Active strikes for this member
    const memberStrikes = useMemo(() => {
        if (!selectedMember?.auth_id) return [];
        return strikes.filter(
            (s) => s.user_id === selectedMember.auth_id && s.status === "ACTIVE"
        );
    }, [strikes, selectedMember]);

    // All strikes (Active + Removed) for history
    const allMemberStrikes = useMemo(() => {
        if (!selectedMember?.auth_id) return [];
        return strikes.filter((s) => s.user_id === selectedMember.auth_id);
    }, [strikes, selectedMember]);

    // Attendance stats and health indicators
    const memberDashboardData = useMemo(() => {
        if (!selectedMember) return null;

        const authId = selectedMember.auth_id;
        const nowTime = Date.now();

        // 1. Filter events scheduled in the past
        const pastEvents = events
            .filter((e) => {
                const d = parseDate(e.date);
                return d !== null && d.getTime() <= nowTime;
            })
            .sort((a, b) => parseDate(b.date)!.getTime() - parseDate(a.date)!.getTime()); // reverse-chronological

        // 2. Set of attended event IDs
        const attendedEventIds = new Set(
            attendance
                .filter((row) => row.user_id === authId && row.event_id)
                .map((row) => row.event_id as string)
        );

        // 3. Set of excused absence event IDs
        const excusedEventIds = new Set(
            absences
                .filter((row) => row.user_id === authId && isExcusedStatus(row.status))
                .map((row) => row.event_id as string)
        );

        // 4. Map past events to status log
        const attendanceHistory = pastEvents.map((evt) => {
            let status: "attended" | "excused" | "missed" = "missed";
            if (attendedEventIds.has(evt.id)) {
                status = "attended";
            } else if (excusedEventIds.has(evt.id)) {
                status = "excused";
            }
            return {
                event: evt,
                status,
                checkinTime: attendance.find((a) => a.user_id === authId && a.event_id === evt.id)?.timestamp || null,
            };
        });

        // 5. Points detail mapping
        const attendedEventList = events.filter((e) => attendedEventIds.has(e.id));
        const pointsBreakdown = {
            professional: attendedEventList.filter((e) => e.event_type === "PROFESSIONAL"),
            social: attendedEventList.filter((e) => e.event_type === "SOCIAL"),
            service: attendedEventList.filter((e) => e.event_type === "SERVICE"),
        };

        // 6. Excused absences list for this member
        const memberAbsences = absences.filter((a) => a.user_id === authId);

        // 7. Recent activity compilation
        const activityList: { id: string; title: string; date: string; emoji: string }[] = [];
        
        // Add check-ins
        attendance
            .filter((a) => a.user_id === authId)
            .forEach((ch) => {
                const evtName = events.find((e) => e.id === ch.event_id)?.name || "Event";
                activityList.push({
                    id: `ch-${ch.id}`,
                    title: `Checked into ${evtName}`,
                    date: ch.timestamp || new Date().toISOString(),
                    emoji: "✅",
                });
            });

        // Add absence submissions
        memberAbsences.forEach((ab) => {
            const evtName = events.find((e) => e.id === ab.event_id)?.name || "Event";
            activityList.push({
                id: `ab-${ab.id}`,
                title: `Submitted absence request for ${evtName} (Status: ${ab.status})`,
                date: ab.submitted_at || new Date().toISOString(),
                emoji: "✉️",
            });
        });

        // Add strikes
        allMemberStrikes.forEach((st) => {
            const evtName = events.find((e) => e.id === st.event_id)?.name || "";
            const eventStr = evtName ? ` (${evtName})` : "";
            activityList.push({
                id: `st-${st.id}`,
                title: st.status === "ACTIVE" 
                    ? `Strike issued: ${st.reason}${eventStr}`
                    : `Strike removed/excused: ${st.reason}${eventStr}`,
                date: st.created_at || new Date().toISOString(),
                emoji: "🚨",
            });
        });

        const recentActivity = activityList
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);

        // 8. Health Status logic
        const pPoints = selectedMember.professional_points || 0;
        const sPoints = selectedMember.social_points || 0;
        const vPoints = selectedMember.service_points || 0;
        const sGoal = pointRequirements.service_goal;
        const pGoal = pointRequirements.professional_goal;
        const soGoal = pointRequirements.social_goal;

        const strikeCount = memberStrikes.length;
        const missingCategories = (pPoints < pGoal ? 1 : 0) + (sPoints < soGoal ? 1 : 0) + (vPoints < sGoal ? 1 : 0);

        let health: "track" | "attention" | "risk" = "track";
        if (strikeCount >= 2 || missingCategories >= 3) {
            health = "risk";
        } else if (strikeCount === 1 || missingCategories >= 1) {
            health = "attention";
        }

        return {
            attendanceHistory,
            pointsBreakdown,
            memberAbsences,
            recentActivity,
            health,
            profCompleted: pPoints >= pGoal,
            socCompleted: sPoints >= soGoal,
            servCompleted: vPoints >= sGoal,
        };
    }, [selectedMember, events, attendance, absences, allMemberStrikes, pointRequirements, memberStrikes]);

    // Admin Action Handlers
    function handleUpdatePoints(category: "professional" | "social" | "service", amount: number) {
        if (!selectedMember) return;
        setActionError(null);
        startTransition(async () => {
            try {
                await updateMemberPoints(selectedMember.id, category, amount);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to update points.");
            }
        });
    }

    function handleSaveNotes() {
        if (!selectedMember) return;
        setActionError(null);
        setNoteSavedFeedback(false);
        startTransition(async () => {
            try {
                await updateOfficerNotes(selectedMember.id, noteText);
                setNoteSavedFeedback(true);
                setTimeout(() => setNoteSavedFeedback(false), 3000);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to save notes.");
            }
        });
    }

    // Toggle admin/officer or member role
    function handlePromoteDemote() {
        if (!selectedMember) return;
        const newRole = selectedMember.role === "admin" || selectedMember.role === "officer" ? "member" : "officer";
        const confirmed = window.confirm(`Change ${selectedMember.name}'s role to ${newRole}?`);
        if (!confirmed) return;

        setActionError(null);
        startTransition(async () => {
            try {
                await updateMemberRole(selectedMember.id, newRole);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to change role.");
            }
        });
    }

    function handleDeactivate() {
        if (!selectedMember) return;
        const confirmed = window.confirm(`Deactivate portal access for ${selectedMember.name}? This member will no longer be able to log into the web app.`);
        if (!confirmed) return;

        setActionError(null);
        startTransition(async () => {
            try {
                await deactivateMember(selectedMember.id);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to deactivate portal.");
            }
        });
    }

    function handleAbsenceApproval(absenceId: string, status: "APPROVED" | "REJECTED") {
        setActionError(null);
        startTransition(async () => {
            try {
                await updateAbsenceStatus(absenceId, status);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to update absence request.");
            }
        });
    }

    function handleDeleteStrikeItem(strikeId: string) {
        const confirmed = window.confirm("Mark this strike as removed/excused?");
        if (!confirmed) return;

        setActionError(null);
        startTransition(async () => {
            try {
                await deleteStrike(strikeId);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to excuse strike.");
            }
        });
    }

    function handleEditMemberSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedMember) return;
        setActionError(null);
        startTransition(async () => {
            try {
                await editMemberDetails(selectedMember.id, editForm);
                setIsEditModalOpen(false);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to update profile.");
            }
        });
    }

    function handleDeleteMemberItem() {
        if (!selectedMember) return;
        const confirmed = window.confirm(`Delete ${selectedMember.name} entirely from the database? This deletes all check-ins, absences, and strikes.`);
        if (!confirmed) return;

        setActionError(null);
        startTransition(async () => {
            try {
                await deleteMember(selectedMember.id, selectedMember.auth_id);
                window.location.reload();
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to delete member.");
            }
        });
    }

    // Status label mapping helper
    function getHealthDisplay(health: "track" | "attention" | "risk") {
        if (health === "risk") {
            return { label: "At Risk", badge: "bg-rose-50 text-rose-700 border-rose-200", icon: "🔴" };
        }
        if (health === "attention") {
            return { label: "Needs Attention", badge: "bg-amber-50 text-amber-700 border-amber-200", icon: "🟡" };
        }
        return { label: "On Track", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "🟢" };
    }

    return (
        <main className="app-shell" style={{ padding: "2rem max(1.5rem, 3vw)" }}>
            <div className="max-w-[1400px] mx-auto space-y-6">
                
                {/* Header Block */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2">
                    <div className="flex items-center gap-3">
                        <img
                            src="/nobe_logo_f.svg"
                            alt="NOBE Illinois"
                            style={{ width: "48px", height: "48px" }}
                        />
                        <div>
                            <p className="eyebrow" style={{ marginBottom: "2px" }}>NOBE Illinois Portal</p>
                            <h1 className="page-title" style={{ fontSize: "2.0rem", fontWeight: 800, margin: 0 }}>Member Report Card</h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/users/admin" className="btn-secondary" style={{ fontSize: "0.85rem", padding: "8px 16px", borderRadius: "12px" }}>
                            ← Back to Dashboard
                        </Link>
                    </div>
                </header>

                {loadError && (
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-sm font-semibold">
                        Error fetching record catalogs: {loadError}
                    </div>
                )}

                {actionError && (
                    <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-sm font-semibold">
                        Action failed: {actionError}
                    </div>
                )}

                {/* Main Content Layout Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
                    
                    {/* LEFT PANEL: Member Selection List */}
                    <aside className="panel flex flex-col" style={{ minHeight: "600px", maxHeight: "850px" }}>
                        <div className="border-b border-slate-100 pb-3 mb-4">
                            <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Member Registry</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Quick search and select profile card</p>
                        </div>

                        <div className="relative mb-3">
                            <input
                                type="text"
                                placeholder="Search by name or email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-amber-500 transition-colors"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: "680px" }}>
                            {filteredMembers.length === 0 ? (
                                <p className="text-slate-400 text-xs text-center py-10">No matching members found.</p>
                            ) : (
                                filteredMembers.map((m) => {
                                    const isSelected = m.id === selectedMemberId;
                                    const activeCount = strikes.filter(s => s.user_id === m.auth_id && s.status === "ACTIVE").length;
                                    
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => setSelectedMemberId(m.id)}
                                            className={`w-full text-left p-3 rounded-xl border transition-all flex flex-col gap-1 cursor-pointer ${
                                                isSelected
                                                    ? "bg-amber-50/60 border-amber-300 shadow-xs"
                                                    : "bg-white/40 border-slate-100/60 hover:bg-slate-50/60"
                                            }`}
                                        >
                                            <div className="flex justify-between items-start gap-1">
                                                <span className="font-bold text-xs text-slate-800 line-clamp-1">{m.name || `${m.first_name} ${m.last_name}`}</span>
                                                <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                                    {m.role || "Member"}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                                                <span className="line-clamp-1">{m.illinois_email}</span>
                                                {activeCount > 0 && (
                                                    <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded-full font-bold text-[9px]">
                                                        {activeCount} {activeCount === 1 ? "Strike" : "Strikes"}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </aside>

                    {/* RIGHT PANEL: REDESIGNED MEMBER REPORT CARD */}
                    <div className="space-y-6">
                        
                        {selectedMember ? (
                            <>
                                {/* 1. PROFILE HEADER */}
                                <section className="panel flex flex-col gap-6" style={{ minHeight: "auto" }}>
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                        <div className="flex gap-4 items-center">
                                            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl">
                                                {selectedMember.name?.charAt(0) || "👤"}
                                            </div>
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h2 className="text-xl font-extrabold text-slate-800">{selectedMember.name}</h2>
                                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] uppercase tracking-wider font-bold border border-slate-200">
                                                        {selectedMember.role || "MEMBER"}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-400 font-medium mt-1">
                                                    {selectedMember.major || "Undeclared Major"} {selectedMember.year ? `'${selectedMember.year.slice(-2)}` : ""} · {selectedMember.college || "University of Illinois"}
                                                </p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    {selectedMember.illinois_email} · Committee: {selectedMember.committee || "None"}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Status and Badges */}
                                        <div className="flex flex-col gap-2 items-end self-stretch sm:self-center">
                                            {memberDashboardData && (
                                                <div className={`px-4 py-2 border rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs ${getHealthDisplay(memberDashboardData.health).badge}`}>
                                                    <span>{getHealthDisplay(memberDashboardData.health).icon}</span>
                                                    <span>Status: {getHealthDisplay(memberDashboardData.health).label}</span>
                                                </div>
                                            )}
                                            
                                            <div className="flex gap-1.5">
                                                <span className="px-2.5 py-0.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[10px] font-bold">
                                                    {memberStrikes.length} Strike{memberStrikes.length === 1 ? "" : "s"}
                                                </span>
                                                <span className="px-2.5 py-0.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[10px] font-bold">
                                                    {selectedMember.auth_id ? "Active Portal" : "No Auth Link"}
                                                </span>
                                                {selectedMember.created_at && (
                                                    <span className="px-2.5 py-0.5 bg-slate-50 border border-slate-200 text-slate-400 rounded-xl text-[10px] font-medium">
                                                        Joined {new Date(selectedMember.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* 2. COMPLIANCE SUMMARY */}
                                <section className="panel" style={{ minHeight: "auto" }}>
                                    <div className="border-b border-slate-100 pb-3 mb-4">
                                        <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Compliance Summary</h3>
                                        <p className="text-[11px] text-slate-400 mt-0.5">Live requirement monitoring and threshold warnings</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
                                        {/* Professional */}
                                        <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Professional</span>
                                                    {memberDashboardData?.profCompleted ? (
                                                        <span className="text-[10px] font-bold text-emerald-600">✓ Completed</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-amber-600">Incomplete</span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-extrabold text-slate-800">
                                                    {selectedMember.professional_points || 0} <span className="text-xs text-slate-400 font-medium">/ {pointRequirements.professional_goal} pts</span>
                                                </p>
                                            </div>
                                            <div className="w-full bg-slate-200/60 rounded-full h-2 mt-4 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${memberDashboardData?.profCompleted ? "bg-emerald-500" : "bg-amber-500"}`}
                                                    style={{ width: `${Math.min(((selectedMember.professional_points || 0) / pointRequirements.professional_goal) * 100, 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Social */}
                                        <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Social</span>
                                                    {memberDashboardData?.socCompleted ? (
                                                        <span className="text-[10px] font-bold text-emerald-600">✓ Completed</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-amber-600">Incomplete</span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-extrabold text-slate-800">
                                                    {selectedMember.social_points || 0} <span className="text-xs text-slate-400 font-medium">/ {pointRequirements.social_goal} pts</span>
                                                </p>
                                            </div>
                                            <div className="w-full bg-slate-200/60 rounded-full h-2 mt-4 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${memberDashboardData?.socCompleted ? "bg-emerald-500" : "bg-amber-500"}`}
                                                    style={{ width: `${Math.min(((selectedMember.social_points || 0) / pointRequirements.social_goal) * 100, 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Service */}
                                        <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Service</span>
                                                    {memberDashboardData?.servCompleted ? (
                                                        <span className="text-[10px] font-bold text-emerald-600">✓ Completed</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-amber-600">Incomplete</span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-extrabold text-slate-800">
                                                    {selectedMember.service_points || 0} <span className="text-xs text-slate-400 font-medium">/ {pointRequirements.service_goal} pts</span>
                                                </p>
                                            </div>
                                            <div className="w-full bg-slate-200/60 rounded-full h-2 mt-4 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${memberDashboardData?.servCompleted ? "bg-emerald-500" : "bg-amber-500"}`}
                                                    style={{ width: `${Math.min(((selectedMember.service_points || 0) / pointRequirements.service_goal) * 100, 100)}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Strikes */}
                                        <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Active Strikes</span>
                                                    {memberStrikes.length >= 2 ? (
                                                        <span className="text-[10px] font-bold text-rose-600">⚠️ Threshold Danger</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-emerald-600">Good Standing</span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-extrabold text-slate-800">
                                                    {memberStrikes.length} <span className="text-xs text-slate-400 font-medium">/ 3 limit</span>
                                                </p>
                                            </div>
                                            <div className="w-full bg-slate-200/60 rounded-full h-2 mt-4 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${memberStrikes.length >= 2 ? "bg-rose-500" : "bg-emerald-500"}`}
                                                    style={{ width: `${Math.min((memberStrikes.length / 3) * 100, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* 3. ATTENDANCE HISTORY & 4. POINT BREAKDOWN */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    
                                    {/* Attendance Log */}
                                    <section className="panel flex flex-col justify-between" style={{ minHeight: "380px" }}>
                                        <div>
                                            <div className="border-b border-slate-100 pb-3 mb-3">
                                                <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Attendance History</h3>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Full check-in register for past events</p>
                                            </div>

                                            {memberDashboardData && memberDashboardData.attendanceHistory.length === 0 ? (
                                                <p className="text-slate-400 text-xs py-12 text-center">No past events recorded in the system.</p>
                                            ) : (
                                                <div className="overflow-y-auto max-h-[300px] space-y-2 pr-1">
                                                    {memberDashboardData?.attendanceHistory.map(({ event, status, checkinTime }) => (
                                                        <div key={event.id} className="p-2.5 bg-white/40 border border-slate-100 rounded-xl flex items-center justify-between text-xs hover:bg-slate-50/50">
                                                            <div>
                                                                <h5 className="font-bold text-slate-800">{event.name}</h5>
                                                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                                    {new Date(event.date || "").toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {event.event_type}
                                                                </p>
                                                                {checkinTime && (
                                                                    <p className="text-[9px] text-slate-400 mt-0.5">Scan time: {new Date(checkinTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center gap-1.5">
                                                                {status === "attended" && (
                                                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-bold rounded-lg border border-emerald-100 text-[10px]">
                                                                        ✅ Attended
                                                                    </span>
                                                                )}
                                                                {status === "excused" && (
                                                                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-bold rounded-lg border border-amber-100 text-[10px]">
                                                                        🟡 Excused
                                                                    </span>
                                                                )}
                                                                {status === "missed" && (
                                                                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 font-bold rounded-lg border border-rose-100 text-[10px]">
                                                                        ❌ Missed
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {/* Points Breakdown */}
                                    <section className="panel flex flex-col justify-between" style={{ minHeight: "380px" }}>
                                        <div>
                                            <div className="border-b border-slate-100 pb-3 mb-3">
                                                <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Point Breakdown</h3>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Breakdown of requirements earned by categories</p>
                                            </div>

                                            {memberDashboardData && (
                                                <div className="overflow-y-auto max-h-[300px] space-y-4 pr-1">
                                                    
                                                    {/* Professional Category */}
                                                    <div>
                                                        <h5 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between">
                                                            <span>Professional ({selectedMember.professional_points || 0} pts)</span>
                                                            <span className="text-slate-500">Goal: {pointRequirements.professional_goal}</span>
                                                        </h5>
                                                        {memberDashboardData.pointsBreakdown.professional.length === 0 ? (
                                                            <p className="text-[10px] text-slate-400 italic">No professional check-ins recorded.</p>
                                                        ) : (
                                                            <ul className="space-y-1">
                                                                {memberDashboardData.pointsBreakdown.professional.map(e => (
                                                                    <li key={e.id} className="p-1.5 bg-slate-50 rounded-lg text-[11px] font-semibold text-slate-700 flex justify-between">
                                                                        <span>✓ {e.name}</span>
                                                                        <span className="text-amber-700 font-bold">+{e.points || 1}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>

                                                    {/* Social Category */}
                                                    <div>
                                                        <h5 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between">
                                                            <span>Social ({selectedMember.social_points || 0} pts)</span>
                                                            <span className="text-slate-500">Goal: {pointRequirements.social_goal}</span>
                                                        </h5>
                                                        {memberDashboardData.pointsBreakdown.social.length === 0 ? (
                                                            <p className="text-[10px] text-slate-400 italic">No social check-ins recorded.</p>
                                                        ) : (
                                                            <ul className="space-y-1">
                                                                {memberDashboardData.pointsBreakdown.social.map(e => (
                                                                    <li key={e.id} className="p-1.5 bg-slate-50 rounded-lg text-[11px] font-semibold text-slate-700 flex justify-between">
                                                                        <span>✓ {e.name}</span>
                                                                        <span className="text-amber-700 font-bold">+{e.points || 1}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>

                                                    {/* Service Category */}
                                                    <div>
                                                        <h5 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between">
                                                            <span>Service ({selectedMember.service_points || 0} pts)</span>
                                                            <span className="text-slate-500">Goal: {pointRequirements.service_goal}</span>
                                                        </h5>
                                                        {memberDashboardData.pointsBreakdown.service.length === 0 ? (
                                                            <p className="text-[10px] text-slate-400 italic">No service check-ins recorded.</p>
                                                        ) : (
                                                            <ul className="space-y-1">
                                                                {memberDashboardData.pointsBreakdown.service.map(e => (
                                                                    <li key={e.id} className="p-1.5 bg-slate-50 rounded-lg text-[11px] font-semibold text-slate-700 flex justify-between">
                                                                        <span>✓ {e.name}</span>
                                                                        <span className="text-amber-700 font-bold">+{e.points || 1}</span>
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>

                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>

                                {/* 5. STRIKE HISTORY & 6. EXCUSED ABSENCES */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    
                                    {/* Strike History */}
                                    <section className="panel flex flex-col justify-between" style={{ minHeight: "380px" }}>
                                        <div>
                                            <div className="border-b border-slate-100 pb-3 mb-3 flex justify-between items-center">
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Strike History</h3>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">Penalties list with administrative actions</p>
                                                </div>
                                                <Link
                                                    href={`/users/admin/reviewMemberStats/${selectedMember.id}/addStrike`}
                                                    className="px-2.5 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold rounded-lg transition-colors"
                                                >
                                                    + Issue Strike
                                                </Link>
                                            </div>

                                            {allMemberStrikes.length === 0 ? (
                                                <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-semibold py-8 text-center">
                                                    ✓ Perfect Standing – No strikes issued.
                                                </div>
                                            ) : (
                                                <div className="overflow-y-auto max-h-[300px] space-y-2 pr-1">
                                                    {allMemberStrikes.map((st) => {
                                                        const eventName = events.find((e) => e.id === st.event_id)?.name || "Non-event strike";
                                                        const isRemoved = st.status === "REMOVED";
                                                        
                                                        return (
                                                            <div key={st.id} className={`p-3 border rounded-xl flex flex-col gap-1.5 transition-all ${isRemoved ? "bg-slate-50/50 border-slate-200 text-slate-400" : "bg-white/40 border-rose-100 text-slate-800"}`}>
                                                                <div className="flex justify-between items-start">
                                                                    <div>
                                                                        <h5 className={`font-bold ${isRemoved ? "line-through" : "text-rose-800"}`}>{st.reason}</h5>
                                                                        <p className="text-[10px] text-slate-400 font-medium">Event: {eventName}</p>
                                                                    </div>
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className={`px-1.5 py-0.5 rounded-sm text-[8px] uppercase tracking-wider font-extrabold ${isRemoved ? "bg-slate-200 text-slate-500" : "bg-rose-50 text-rose-600 border border-rose-100"}`}>
                                                                            {st.status}
                                                                        </span>
                                                                        {!isRemoved && (
                                                                            <button
                                                                                onClick={() => handleDeleteStrikeItem(st.id)}
                                                                                className="text-[9px] text-slate-500 hover:text-rose-600 font-bold underline"
                                                                            >
                                                                                Excuse
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <p className="text-[9px] text-slate-400 font-semibold self-start">
                                                                    Issued: {new Date(st.created_at || "").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                                                </p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </section>

                                    {/* Excused Absence Requests */}
                                    <section className="panel flex flex-col justify-between" style={{ minHeight: "380px" }}>
                                        <div>
                                            <div className="border-b border-slate-100 pb-3 mb-3">
                                                <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Absence Requests</h3>
                                                <p className="text-[11px] text-slate-400 mt-0.5">Excused absence application log</p>
                                            </div>

                                            {memberDashboardData && memberDashboardData.memberAbsences.length === 0 ? (
                                                <p className="text-slate-400 text-xs py-12 text-center">No absence requests submitted.</p>
                                            ) : (
                                                <div className="overflow-y-auto max-h-[300px] space-y-2.5 pr-1">
                                                    {memberDashboardData?.memberAbsences.map((ab) => {
                                                        const eventName = events.find((e) => e.id === ab.event_id)?.name || "Unnamed Event";
                                                        const isPendingStatus = ab.status?.trim().toUpperCase() === "PENDING";
                                                        const isApproved = ab.status?.trim().toUpperCase() === "APPROVED";
                                                        
                                                        return (
                                                            <div key={ab.id} className="p-3 bg-white/40 border border-slate-100 rounded-xl flex flex-col gap-2">
                                                                <div className="flex justify-between items-start">
                                                                    <div>
                                                                        <h5 className="font-bold text-slate-800 text-xs">{eventName}</h5>
                                                                        <p className="text-[10px] text-slate-400 font-medium">Submitted {new Date(ab.submitted_at || "").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                                                                    </div>
                                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                                                                        isApproved
                                                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                                                            : isPendingStatus
                                                                            ? "bg-amber-50 text-amber-700 border border-amber-100"
                                                                            : "bg-slate-100 text-slate-600 border border-slate-200"
                                                                    }`}>
                                                                        {ab.status}
                                                                    </span>
                                                                </div>

                                                                <div className="bg-slate-50/50 p-2 rounded-lg border border-slate-100/60 text-[11px] text-slate-600">
                                                                    <span className="font-bold text-slate-500">Reason:</span> &ldquo;{ab.reason}&rdquo;
                                                                </div>

                                                                {isPendingStatus && (
                                                                    <div className="flex gap-2 self-end mt-1">
                                                                        <button
                                                                            onClick={() => handleAbsenceApproval(ab.id, "APPROVED")}
                                                                            className="px-2 py-1 text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold rounded-lg transition-colors cursor-pointer"
                                                                        >
                                                                            Approve
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleAbsenceApproval(ab.id, "REJECTED")}
                                                                            className="px-2 py-1 text-[10px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-lg transition-colors cursor-pointer"
                                                                        >
                                                                            Reject
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>

                                {/* Admin Actions */}
                                <section className="panel flex flex-col justify-between" style={{ minHeight: "auto" }}>
                                    <div>
                                        <div className="border-b border-slate-100 pb-3 mb-3">
                                            <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Admin Actions</h3>
                                            <p className="text-[11px] text-slate-400 mt-0.5">Administrative commands and overrides</p>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                                            {/* Point increments */}
                                            <button
                                                onClick={() => handleUpdatePoints("professional", 1)}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                            >
                                                💼 +1 Prof Point
                                            </button>
                                            <button
                                                onClick={() => handleUpdatePoints("professional", -1)}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                            >
                                                💼 -1 Prof Point
                                            </button>
                                            
                                            <button
                                                onClick={() => handleUpdatePoints("social", 1)}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                            >
                                                🎭 +1 Social Point
                                            </button>
                                            <button
                                                onClick={() => handleUpdatePoints("social", -1)}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                            >
                                                🎭 -1 Social Point
                                            </button>

                                            <button
                                                onClick={() => handleUpdatePoints("service", 1)}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                            >
                                                🛠️ +1 Service Point
                                            </button>
                                            <button
                                                onClick={() => handleUpdatePoints("service", -1)}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                            >
                                                🛠️ -1 Service Point
                                            </button>

                                            {/* Role, Deactivate, Email */}
                                            <button
                                                onClick={handlePromoteDemote}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                            >
                                                👑 Toggle Officer Role
                                            </button>

                                            <button
                                                onClick={() => setIsEditModalOpen(true)}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                            >
                                                ✏️ Edit Profile Info
                                            </button>

                                            <button
                                                onClick={handleDeactivate}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                            >
                                                🔒 Deactivate Portal
                                            </button>

                                            <a
                                                href={`mailto:${selectedMember.illinois_email}?subject=NOBE%20Status%20Update`}
                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer flex items-center"
                                            >
                                                ✉️ Send Email
                                            </a>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleDeleteMemberItem}
                                        disabled={isPending}
                                        className="w-full mt-4 py-2 text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl transition-all cursor-pointer text-center"
                                    >
                                        {isPending ? "Processing..." : "❌ Permanent Delete Member"}
                                    </button>
                                </section>
                            </>
                        ) : (
                            <section className="panel text-center py-20 text-slate-400">
                                <span className="text-4xl">👥</span>
                                <p className="font-bold text-slate-700 text-sm mt-3">Select a Member</p>
                                <p className="text-xs text-slate-400 mt-1">Pick a profile from the left registry to review their compliance card.</p>
                            </section>
                        )}
                    </div>
                </div>
            </div>

            {/* EDIT PROFILE MODAL */}
            {isEditModalOpen && selectedMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-filter backdrop-blur-xs p-4">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-xl relative animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-start mb-4 border-b border-slate-100 pb-3">
                            <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ADMIN OVERRIDE</span>
                                <h3 className="font-bold text-slate-800 text-lg leading-snug">Edit Member Profile</h3>
                            </div>
                            <button
                                onClick={() => setIsEditModalOpen(false)}
                                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleEditMemberSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-slate-500 font-bold mb-1">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-500 font-bold mb-1">Illinois Email</label>
                                <input
                                    type="email"
                                    required
                                    value={editForm.illinois_email}
                                    onChange={(e) => setEditForm({ ...editForm, illinois_email: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-slate-500 font-bold mb-1">Major</label>
                                <input
                                    type="text"
                                    value={editForm.major}
                                    onChange={(e) => setEditForm({ ...editForm, major: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-slate-500 font-bold mb-1">Grad Year (e.g. 2027)</label>
                                    <input
                                        type="text"
                                        value={editForm.year}
                                        onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-slate-500 font-bold mb-1">College</label>
                                    <input
                                        type="text"
                                        value={editForm.college}
                                        onChange={(e) => setEditForm({ ...editForm, college: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-500 font-bold mb-1">Committee</label>
                                <input
                                    type="text"
                                    value={editForm.committee}
                                    onChange={(e) => setEditForm({ ...editForm, committee: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-colors"
                                />
                            </div>

                            <div className="flex gap-3 justify-end pt-3 border-t border-slate-100 mt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isPending}
                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors cursor-pointer"
                                >
                                    {isPending ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </main>
    );
}

function parseDate(value: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isExcusedStatus(status: string | null) {
    return typeof status === "string" && excusedStatuses.has(status.trim().toUpperCase());
}