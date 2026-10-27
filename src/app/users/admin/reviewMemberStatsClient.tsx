"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    deleteMember,
    deleteStrike,
    updateMemberPoints,
    updateOfficerNotes,
    updateMemberRole,
    deactivateMember,
    updateAbsenceStatus,
    editMemberDetails,
    updateMemberIsPM,
    updateMemberIsNewMember,
    refreshAllMemberPoints,
} from "./reviewMemberStats/actions";
import { isNewMemberMandatory } from "@/app/utils/eventPoints";

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
    is_PM?: boolean | null;
    is_new_member?: boolean | null;
};

export type EventRecord = {
    id: string;
    name: string | null;
    date: string | null;
    event_type?: string | null;
    points?: number | null;
    is_mandatory?: boolean | null;
    description?: string | null;
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

export function normalizeCommittee(raw?: string | null): string {
    if (!raw || !raw.trim()) return "Unassigned";
    const cleaned = raw.trim();
    const lower = cleaned.toLowerCase();
    if (lower.includes("consult")) return "Consulting";
    if (lower.includes("prod") || lower === "pd" || lower.startsWith("pd")) return "Product Development";
    if (lower.includes("tech")) return "Technology";
    if (lower.includes("exec")) return "Exec";
    return cleaned;
}

function getCommitteeBadgeColor(normCommittee: string): string {
    switch (normCommittee) {
        case "Consulting":
            return "bg-blue-50 text-blue-700 border-blue-200";
        case "Product Development":
            return "bg-emerald-50 text-emerald-700 border-emerald-200";
        case "Technology":
            return "bg-cyan-50 text-cyan-700 border-cyan-200";
        case "Exec":
            return "bg-amber-50 text-amber-800 border-amber-200";
        default:
            return "bg-slate-50 text-slate-500 border-slate-200";
    }
}

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
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
    const [isPending, startTransition] = useTransition();
    const [actionError, setActionError] = useState<string | null>(null);
    const [isRefreshingPoints, setIsRefreshingPoints] = useState(false);
    const [refreshSuccessFeedback, setRefreshSuccessFeedback] = useState<string | null>(null);

    // Filters and Grouping State
    const [statusFilter, setStatusFilter] = useState<"ALL" | "NEW_MEMBER" | "EXEC" | "PM" | "MEMBER" | "WITH_STRIKES">("ALL");
    const [committeeFilter, setCommitteeFilter] = useState<string>("ALL");
    const [groupByCommittee, setGroupByCommittee] = useState<boolean>(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const toggleGroupCollapse = (committeeName: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(committeeName)) next.delete(committeeName);
            else next.add(committeeName);
            return next;
        });
    };

    const activeStrikesCountMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const s of strikes) {
            if (s.user_id && s.status === "ACTIVE") {
                map.set(s.user_id, (map.get(s.user_id) || 0) + 1);
            }
        }
        return map;
    }, [strikes]);

    const getMemberStrikesCount = (m: MemberRecord) => {
        return m.auth_id ? (activeStrikesCountMap.get(m.auth_id) ?? (m.strikes || 0)) : (m.strikes || 0);
    };

    const availableCommittees = useMemo(() => {
        const set = new Set<string>();
        for (const m of members) {
            set.add(normalizeCommittee(m.committee));
        }
        const order = ["Consulting", "Product Development", "Technology", "Exec"];
        const list = Array.from(set);
        list.sort((a, b) => {
            if (a === "Unassigned") return 1;
            if (b === "Unassigned") return -1;
            const idxA = order.indexOf(a);
            const idxB = order.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });
        return list;
    }, [members]);

    const countsByStatus = useMemo(() => {
        let newMembers = 0;
        let exec = 0;
        let pm = 0;
        let regularMember = 0;
        let withStrikes = 0;

        for (const m of members) {
            const isExec = m.role?.toUpperCase() === "ADMIN" || normalizeCommittee(m.committee) === "Exec";
            const isPM = Boolean(m.is_PM);
            const isNew = Boolean(m.is_new_member);
            const strikesCount = getMemberStrikesCount(m);

            if (isNew) newMembers++;
            if (isExec) exec++;
            if (isPM) pm++;
            if (!isExec && !isPM && !isNew) regularMember++;
            if (strikesCount > 0 && m.role?.toUpperCase() !== "ADMIN") withStrikes++;
        }

        return {
            all: members.length,
            newMembers,
            exec,
            pm,
            regularMember,
            withStrikes,
        };
    }, [members, activeStrikesCountMap]);
    
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
        role: "MEMBER",
        is_PM: false,
        is_new_member: false,
    });

    const filteredMembers = useMemo(() => {
        const query = search.trim().toLowerCase();

        return members.filter((member) => {
            // 1. Text search
            if (query) {
                const name = (member.name || `${member.first_name || ""} ${member.last_name || ""}`).toLowerCase();
                const email = (member.illinois_email || "").toLowerCase();
                const committee = (member.committee || "").toLowerCase();
                const major = (member.major || "").toLowerCase();
                const matchesText =
                    name.includes(query) ||
                    email.includes(query) ||
                    committee.includes(query) ||
                    major.includes(query);
                if (!matchesText) return false;
            }

            // 2. Status filter
            const isExec = member.role?.toUpperCase() === "ADMIN" || normalizeCommittee(member.committee) === "Exec";
            const isPM = Boolean(member.is_PM);
            const isNew = Boolean(member.is_new_member);
            const strikesCount = getMemberStrikesCount(member);
            const hasStrikes = strikesCount > 0 && member.role?.toUpperCase() !== "ADMIN";

            if (statusFilter === "NEW_MEMBER" && !isNew) return false;
            if (statusFilter === "EXEC" && !isExec) return false;
            if (statusFilter === "PM" && !isPM) return false;
            if (statusFilter === "MEMBER" && (isExec || isPM || isNew)) return false;
            if (statusFilter === "WITH_STRIKES" && !hasStrikes) return false;

            // 3. Committee filter
            if (committeeFilter !== "ALL") {
                const norm = normalizeCommittee(member.committee);
                if (norm !== committeeFilter) return false;
            }

            return true;
        });
    }, [members, search, statusFilter, committeeFilter, activeStrikesCountMap]);

    const groupedMembers = useMemo(() => {
        if (!groupByCommittee) return null;

        const groups = new Map<string, MemberRecord[]>();
        for (const c of availableCommittees) {
            groups.set(c, []);
        }

        for (const m of filteredMembers) {
            const c = normalizeCommittee(m.committee);
            const existing = groups.get(c);
            if (existing) {
                existing.push(m);
            } else {
                groups.set(c, [m]);
            }
        }

        return Array.from(groups.entries()).filter(([_, list]) => list.length > 0);
    }, [filteredMembers, groupByCommittee, availableCommittees]);

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
                role: selectedMember.role?.toUpperCase() === "ADMIN" ? "ADMIN" : "MEMBER",
                is_PM: Boolean(selectedMember.is_PM),
                is_new_member: Boolean(selectedMember.is_new_member),
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

    // Manual points given by admin (stored in SystemSettings)
    const selectedManualPoints = useMemo(() => {
        if (!selectedMember) return { professional: 0, social: 0, service: 0 };
        const key = `manual_points_member_id_${selectedMember.id}`;
        const setting = systemSettings.find((s) => s.key === key);
        if (!setting?.value) return { professional: 0, social: 0, service: 0 };
        try {
            const parsed = JSON.parse(setting.value);
            return {
                professional: Number(parsed.professional) || 0,
                social: Number(parsed.social) || 0,
                service: Number(parsed.service) || 0,
            };
        } catch {
            return { professional: 0, social: 0, service: 0 };
        }
    }, [selectedMember, systemSettings]);

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
            if (excusedEventIds.has(evt.id)) {
                status = "excused";
            } else if (attendedEventIds.has(evt.id)) {
                status = "attended";
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
            professional: attendedEventList.filter((e) => e.event_type?.toUpperCase() === "PROFESSIONAL"),
            social: attendedEventList.filter((e) => e.event_type?.toUpperCase() === "SOCIAL"),
            service: attendedEventList.filter((e) => (e.event_type?.toUpperCase() || "").includes("SERVICE")),
            other: attendedEventList.filter((e) => !["PROFESSIONAL", "SOCIAL"].includes(e.event_type?.toUpperCase() || "") && !(e.event_type?.toUpperCase() || "").includes("SERVICE")),
        };

        // 6. Excused absences & attendance list for this member
        const memberAbsences = absences.filter((a) => a.user_id === authId);
        const memberAttendance = attendance.filter((a) => a.user_id === authId);

        // 7. Recent activity compilation
        const activityList: Array<{ id: string; type: "attendance" | "excuse" | "strike"; title: string; date: string; badge?: string; badgeColor?: string }> = [];

        memberAttendance.forEach((att) => {
            const ev = events.find((e) => e.id === att.event_id);
            activityList.push({
                id: `att-${att.id}`,
                type: "attendance",
                title: `Checked into ${ev?.name || "Event"}`,
                date: att.timestamp || new Date().toISOString(),
                badge: ev?.event_type || "Event",
                badgeColor: "bg-blue-100 text-blue-800",
            });
        });

        memberAbsences.forEach((ab) => {
            const ev = events.find((e) => e.id === ab.event_id);
            activityList.push({
                id: `ab-${ab.id}`,
                type: "excuse",
                title: `Absence request for ${ev?.name || "Event"}: ${ab.reason}`,
                date: ab.submitted_at || new Date().toISOString(),
                badge: ab.status || undefined,
                badgeColor: ab.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : ab.status === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800",
            });
        });

        memberStrikes.forEach((st) => {
            activityList.push({
                id: `st-${st.id}`,
                type: "strike",
                title: `Strike added: ${st.reason}`,
                date: st.created_at || new Date().toISOString(),
                badge: st.strike_type,
                badgeColor: "bg-rose-100 text-rose-800",
            });
        });

        const recentActivity = activityList
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);

        // 8. Health Status logic (Admins exempt; 5 Professional + 5 Pooled Service & Social for standard; 4 Professional + 4 Pooled for PMs)
        const isAdmin = selectedMember.role?.toUpperCase() === "ADMIN";
        const isPM = Boolean(selectedMember.is_PM);
        const pPoints = selectedMember.professional_points || 0;
        const sPoints = selectedMember.social_points || 0;
        const vPoints = selectedMember.service_points || 0;
        const pooledPoints = sPoints + vPoints;
        const pGoal = isPM ? 4 : (pointRequirements.professional_goal ?? 5);
        const pooledGoal = isPM ? 4 : ((pointRequirements as any).service_social_goal ?? 5);
        const totalGoal = isPM ? 8 : ((pointRequirements as any).total_goal ?? 10);
        const totalPoints = pPoints + pooledPoints;

        const strikeCount = isAdmin ? 0 : memberStrikes.length;
        const profCompleted = isAdmin || pPoints >= pGoal;
        const pooledCompleted = isAdmin || pooledPoints >= pooledGoal;
        const totalCompleted = isAdmin || totalPoints >= totalGoal;
        const missingCategories = (profCompleted ? 0 : 1) + (pooledCompleted ? 0 : 1);

        let health: "track" | "attention" | "risk" | "exempt" = "track";
        if (isAdmin) {
            health = "exempt";
        } else if (strikeCount >= 2 || missingCategories >= 2) {
            health = "risk";
        } else if (strikeCount === 1 || missingCategories >= 1) {
            health = "attention";
        }

        return {
            isAdmin,
            isPM,
            attendanceHistory,
            pointsBreakdown,
            memberAbsences,
            recentActivity,
            health,
            profCompleted,
            pooledCompleted,
            totalCompleted,
            pooledPoints,
            totalPoints,
            pGoal,
            pooledGoal,
            totalGoal,
        };
    }, [selectedMember, events, attendance, absences, allMemberStrikes, pointRequirements, memberStrikes]);

    // Admin Action Handlers
    function handleRefreshPoints() {
        setActionError(null);
        setRefreshSuccessFeedback(null);
        setIsRefreshingPoints(true);
        startTransition(async () => {
            try {
                const result = await refreshAllMemberPoints();
                router.refresh();
                setRefreshSuccessFeedback(
                    `Points refreshed successfully! Aligned points with attendance breakdown for all members (${result.updatedCount} updated).`
                );
                setTimeout(() => setRefreshSuccessFeedback(null), 6000);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to refresh points.");
            } finally {
                setIsRefreshingPoints(false);
            }
        });
    }

    function handleTogglePM(is_PM: boolean) {
        if (!selectedMember) return;
        setActionError(null);
        startTransition(async () => {
            try {
                await updateMemberIsPM(selectedMember.id, is_PM);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to update PM status.");
            }
        });
    }

    function handleToggleNewMember(is_new_member: boolean) {
        if (!selectedMember) return;
        setActionError(null);
        startTransition(async () => {
            try {
                await updateMemberIsNewMember(selectedMember.id, is_new_member);
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to update new member status.");
            }
        });
    }

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

    // Toggle admin or member role
    function handlePromoteDemote() {
        if (!selectedMember) return;
        const isCurrentAdmin = selectedMember.role?.toUpperCase() === "ADMIN";
        const newRole = isCurrentAdmin ? "MEMBER" : "ADMIN";
        const confirmed = window.confirm(
            isCurrentAdmin
                ? `Change ${selectedMember.name}'s role to MEMBER? This will revoke administrator privileges.`
                : `Change ${selectedMember.name}'s role to ADMIN? This will grant full administrator privileges.`
        );
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
        const confirmed = window.confirm(`Delete ${selectedMember.name} entirely from the database? This deletes all check-ins, absences, strikes, and permanently removes their authentication account so the email can be re-used.`);
        if (!confirmed) return;

        setActionError(null);
        startTransition(async () => {
            try {
                await deleteMember(selectedMember.id, selectedMember.auth_id, selectedMember.illinois_email);
                window.location.reload();
            } catch (err) {
                setActionError(err instanceof Error ? err.message : "Failed to delete member.");
            }
        });
    }

    // Status label mapping helper
    function getHealthDisplay(health: "track" | "attention" | "risk" | "exempt") {
        if (health === "exempt") {
            return { label: "Officer (Exempt)", badge: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" };
        }
        if (health === "risk") {
            return { label: "At Risk", badge: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-600" };
        }
        if (health === "attention") {
            return { label: "Needs Attention", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" };
        }
        return { label: "On Track", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
    }

    function escapeCsvValue(val: string | number | null | undefined): string {
        if (val === null || val === undefined) return "";
        const str = String(val).trim();
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    function handleDownloadRosterCsv() {
        const headers = ["First Name", "Last Name", "netid", "year", "major", "committee", "College", "PM", "New Member"];

        const rows = members.map((m) => {
            let firstName = m.first_name || "";
            let lastName = m.last_name || "";

            if (!firstName && m.name) {
                const parts = m.name.trim().split(/\s+/);
                firstName = parts[0] || "";
                if (!lastName && parts.length > 1) {
                    lastName = parts.slice(1).join(" ");
                }
            }

            const netid = m.illinois_email ? m.illinois_email.split("@")[0].trim() : "";
            const year = m.year || "";
            const major = m.major || "";
            const committee = m.committee || "";
            const college = m.college || "";
            const isPM = m.is_PM ? "Yes" : "No";
            const isNewMember = m.is_new_member ? "Yes" : "No";

            return [
                escapeCsvValue(firstName),
                escapeCsvValue(lastName),
                escapeCsvValue(netid),
                escapeCsvValue(year),
                escapeCsvValue(major),
                escapeCsvValue(committee),
                escapeCsvValue(college),
                escapeCsvValue(isPM),
                escapeCsvValue(isNewMember),
            ].join(",");
        });

        const csvContent = [headers.join(","), ...rows].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `nobe_roster_${new Date().toISOString().split("T")[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    const renderMemberCard = (m: MemberRecord) => {
        const isSelected = m.id === selectedMemberId;
        const activeCount = getMemberStrikesCount(m);
        const normComm = normalizeCommittee(m.committee);
        const totalPts = (m.professional_points || 0) + (m.social_points || 0) + (m.service_points || 0);

        return (
            <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMemberId(m.id)}
                className={`w-full text-left p-2 rounded-xl border transition-all flex flex-col gap-0.5 cursor-pointer ${
                    isSelected
                        ? "bg-amber-50/70 border-amber-300 shadow-xs ring-1 ring-amber-300/50"
                        : "bg-white/60 border-slate-200/70 hover:bg-slate-50/80 hover:border-slate-300/80"
                }`}
            >
                <div className="flex justify-between items-start gap-1">
                    <span className="font-bold text-xs text-slate-800 line-clamp-1">
                        {m.name || `${m.first_name || ""} ${m.last_name || ""}`}
                    </span>
                    <span className="text-[10px] font-extrabold text-slate-600 shrink-0">
                        {totalPts} pts
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-1 my-0.5">
                    {normComm !== "Unassigned" && (
                        <span className={`text-[8.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${getCommitteeBadgeColor(normComm)}`}>
                            {normComm}
                        </span>
                    )}
                    {m.is_PM && (
                        <span className="text-[8.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                            PM
                        </span>
                    )}
                    {m.is_new_member && (
                        <span className="text-[8.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                            New Member
                        </span>
                    )}
                    {m.role?.toUpperCase() === "ADMIN" && (
                        <span className="text-[8.5px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                            Exec
                        </span>
                    )}
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                    <span className="line-clamp-1 text-[10px]">{m.illinois_email}</span>
                    {activeCount > 0 && m.role?.toUpperCase() !== "ADMIN" && (
                        <span className="px-1.5 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 rounded-full font-extrabold text-[8.5px] shrink-0">
                            {activeCount} {activeCount === 1 ? "Strike" : "Strikes"}
                        </span>
                    )}
                </div>
            </button>
        );
    };

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
                        <button
                            type="button"
                            onClick={handleRefreshPoints}
                            disabled={isRefreshingPoints || isPending}
                            className="group relative inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 active:from-emerald-700 active:to-teal-700 text-white shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed border border-emerald-500/40"
                            title="Recalculate and align points for all members based on attendance breakdown"
                        >
                            <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-white/20 text-white shrink-0">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={isRefreshingPoints ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}
                                >
                                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                                </svg>
                            </span>
                            <span className="font-semibold text-xs tracking-tight normal-case text-white antialiased drop-shadow-2xs">
                                {isRefreshingPoints ? "Refreshing Points..." : "Refresh Points"}
                            </span>
                        </button>
                        <Link href="/users/admin" className="btn-secondary" style={{ fontSize: "0.85rem", padding: "8px 16px", borderRadius: "12px" }}>
                            ← Back to Dashboard
                        </Link>
                    </div>
                </header>

                {refreshSuccessFeedback && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-semibold flex items-center justify-between shadow-xs">
                        <div className="flex items-center gap-2">
                            <span className="text-base">✓</span>
                            <span>{refreshSuccessFeedback}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setRefreshSuccessFeedback(null)}
                            className="text-emerald-700 hover:text-emerald-950 font-bold ml-4 text-xs uppercase tracking-wider cursor-pointer"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

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
                <div className="grid grid-cols-1 lg:grid-cols-[330px_1fr] xl:grid-cols-[350px_1fr] gap-6 items-start">
                    
                    {/* LEFT PANEL: Member Selection List */}
                    <aside className="panel flex flex-col gap-2.5" style={{ minHeight: "680px", maxHeight: "940px" }}>
                        <div className="border-b border-slate-100 pb-2 flex items-center justify-between gap-2">
                            <div>
                                <h3 className="font-bold text-slate-800 text-xs tracking-wide uppercase">Member Registry</h3>
                                <p className="text-[10px] text-slate-400">
                                    {filteredMembers.length} of {members.length} members
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleDownloadRosterCsv}
                                title="Download complete member roster as CSV"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-slate-800 border border-amber-200 text-[11px] font-extrabold uppercase tracking-wider transition-all shadow-2xs hover:shadow-xs cursor-pointer shrink-0"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                <span>CSV</span>
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search members..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-slate-50 hover:bg-white border border-slate-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all shadow-2xs"
                            />
                            <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => setSearch("")}
                                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs font-bold p-0.5 rounded-full hover:bg-slate-200/50 cursor-pointer transition-colors"
                                    title="Clear search"
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Filter Controls: Committee + Group Toggle */}
                        <div className="flex items-center gap-1.5">
                            <select
                                id="committee-filter"
                                value={committeeFilter}
                                onChange={(e) => setCommitteeFilter(e.target.value)}
                                className="flex-1 min-w-0 bg-slate-50 hover:bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 focus:outline-hidden focus:border-amber-500 shadow-2xs cursor-pointer truncate"
                                title="Filter by Committee"
                            >
                                <option value="ALL">All Committees ({members.length})</option>
                                {availableCommittees.map((c) => {
                                    const count = members.filter((m) => normalizeCommittee(m.committee) === c).length;
                                    return (
                                        <option key={c} value={c}>
                                            {c} ({count})
                                        </option>
                                    );
                                })}
                            </select>

                            <button
                                type="button"
                                onClick={() => setGroupByCommittee(!groupByCommittee)}
                                title={groupByCommittee ? "Switch to flat list" : "Group members by committee"}
                                className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 shadow-2xs shrink-0 ${
                                    groupByCommittee
                                        ? "bg-amber-100 text-amber-900 border-amber-300 shadow-xs"
                                        : "bg-slate-50 hover:bg-white text-slate-600 border-slate-200"
                                }`}
                            >
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <rect x="3" y="3" width="7" height="7" rx="1" />
                                    <rect x="14" y="3" width="7" height="7" rx="1" />
                                    <rect x="14" y="14" width="7" height="7" rx="1" />
                                    <rect x="3" y="14" width="7" height="7" rx="1" />
                                </svg>
                                <span className="text-[11px]">{groupByCommittee ? "Grouped" : "Group"}</span>
                            </button>
                        </div>

                        {/* Compact Status Chips */}
                        <div className="flex flex-wrap gap-1 items-center">
                            {[
                                { key: "ALL", label: "All", count: countsByStatus.all },
                                { key: "NEW_MEMBER", label: "New", count: countsByStatus.newMembers },
                                { key: "EXEC", label: "Exec", count: countsByStatus.exec },
                                { key: "PM", label: "PM", count: countsByStatus.pm },
                                { key: "MEMBER", label: "Members", count: countsByStatus.regularMember },
                                { key: "WITH_STRIKES", label: "Strikes", count: countsByStatus.withStrikes },
                            ].map((f) => {
                                const isActive = statusFilter === f.key;
                                return (
                                    <button
                                        key={f.key}
                                        type="button"
                                        onClick={() => setStatusFilter(f.key as any)}
                                        className={`px-2 py-0.5 rounded-md font-bold text-[10.5px] transition-all cursor-pointer flex items-center gap-1 ${
                                            isActive
                                                ? "bg-slate-900 text-white shadow-2xs"
                                                : "bg-slate-100/80 hover:bg-slate-200/70 text-slate-600 border border-slate-200/60"
                                        }`}
                                    >
                                        <span>{f.label}</span>
                                        <span className={`text-[9px] px-1 py-0 rounded-full font-extrabold ${
                                            isActive ? "bg-slate-700 text-slate-200" : "bg-slate-200/80 text-slate-500"
                                        }`}>
                                            {f.count}
                                        </span>
                                    </button>
                                );
                            })}

                            {(statusFilter !== "ALL" || committeeFilter !== "ALL" || search) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStatusFilter("ALL");
                                        setCommitteeFilter("ALL");
                                        setSearch("");
                                    }}
                                    className="text-[10px] text-amber-700 hover:text-amber-900 font-bold ml-auto px-1 hover:underline cursor-pointer"
                                    title="Reset all filters"
                                >
                                    Reset
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 pt-0.5" style={{ minHeight: "380px", maxHeight: "640px" }}>
                            {filteredMembers.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                                    <p className="text-slate-400 text-xs font-medium">No members found matching these filters.</p>
                                    {(statusFilter !== "ALL" || committeeFilter !== "ALL" || search) && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setStatusFilter("ALL");
                                                setCommitteeFilter("ALL");
                                                setSearch("");
                                            }}
                                            className="mt-2.5 text-xs text-amber-700 font-bold hover:underline cursor-pointer inline-flex items-center gap-1"
                                        >
                                            Reset all filters
                                        </button>
                                    )}
                                </div>
                            ) : groupByCommittee && groupedMembers ? (
                                <div className="space-y-3">
                                    {groupedMembers.map(([commName, memberList]) => {
                                        const isCollapsed = collapsedGroups.has(commName);
                                        return (
                                            <div key={commName} className="rounded-xl border border-slate-200/80 bg-slate-50/40 overflow-hidden shadow-2xs">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleGroupCollapse(commName)}
                                                    className="w-full flex items-center justify-between p-2.5 bg-slate-100/70 hover:bg-slate-200/60 transition-colors cursor-pointer text-left"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <svg
                                                            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            strokeWidth="2.5"
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                        <span className="font-extrabold text-xs uppercase tracking-wider text-slate-700 truncate">
                                                            {commName}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-slate-600 font-extrabold border border-slate-200 shadow-2xs">
                                                        {memberList.length}
                                                    </span>
                                                </button>
                                                {!isCollapsed && (
                                                    <div className="p-2 space-y-1.5">
                                                        {memberList.map((m) => renderMemberCard(m))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                filteredMembers.map((m) => renderMemberCard(m))
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
                                            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl font-bold text-amber-700 uppercase">
                                                {selectedMember.name?.charAt(0) || "?"}
                                            </div>
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h2 className="text-xl font-extrabold text-slate-800">{selectedMember.name}</h2>
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-bold border ${
                                                        selectedMember.role?.toUpperCase() === "ADMIN"
                                                            ? "bg-amber-100 text-amber-800 border-amber-300 font-extrabold"
                                                            : "bg-slate-100 text-slate-600 border-slate-200"
                                                    }`}>
                                                        {selectedMember.role || "MEMBER"}
                                                    </span>
                                                    {selectedMember.is_PM && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
                                                            PM
                                                        </span>
                                                    )}
                                                    {selectedMember.is_new_member && (
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-extrabold bg-teal-100 text-teal-800 border border-teal-200">
                                                            New Member
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-400 font-medium mt-1">
                                                    {[
                                                        selectedMember.major || "Undeclared Major",
                                                        formatMemberYear(selectedMember.year),
                                                        selectedMember.college || "University of Illinois",
                                                    ]
                                                        .filter(Boolean)
                                                        .join(" · ")}
                                                </p>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    {selectedMember.illinois_email} {selectedMember.committee ? `· Committee: ${selectedMember.committee}` : ""}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Status and Badges */}
                                        <div className="flex flex-col gap-2 items-end self-stretch sm:self-center">
                                            {memberDashboardData && (
                                                <div className={`px-4 py-2 border rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xs ${getHealthDisplay(memberDashboardData.health).badge}`}>
                                                    <span className={`w-2 h-2 rounded-full ${getHealthDisplay(memberDashboardData.health).dot}`}></span>
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
                                                    {memberDashboardData?.isAdmin ? (
                                                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-sm">Exempt</span>
                                                    ) : memberDashboardData?.profCompleted ? (
                                                        <span className="text-[10px] font-bold text-emerald-600">✓ Completed</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-amber-600">Incomplete</span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-extrabold text-slate-800">
                                                    {selectedMember.professional_points || 0}{" "}
                                                    <span className="text-xs text-slate-400 font-medium">
                                                        {memberDashboardData?.isAdmin ? "pts (Admin)" : `/ ${memberDashboardData?.pGoal ?? 5} pts`}
                                                    </span>
                                                </p>
                                            </div>
                                            <div className="w-full bg-slate-200/60 rounded-full h-2 mt-4 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${
                                                        memberDashboardData?.isAdmin
                                                            ? "bg-purple-400"
                                                            : memberDashboardData?.profCompleted
                                                            ? "bg-emerald-500"
                                                            : "bg-amber-500"
                                                    }`}
                                                    style={{
                                                        width: memberDashboardData?.isAdmin
                                                            ? "100%"
                                                            : `${Math.min(((selectedMember.professional_points || 0) / (memberDashboardData?.pGoal ?? 5)) * 100, 100)}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Service & Social (Pooled) */}
                                        <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Service & Social (Pooled)</span>
                                                    {memberDashboardData?.isAdmin ? (
                                                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-sm">Exempt</span>
                                                    ) : memberDashboardData?.pooledCompleted ? (
                                                        <span className="text-[10px] font-bold text-emerald-600">✓ Completed</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-amber-600">Incomplete</span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-extrabold text-slate-800">
                                                    {memberDashboardData?.pooledPoints ?? 0}{" "}
                                                    <span className="text-xs text-slate-400 font-medium">
                                                        {memberDashboardData?.isAdmin ? "pts (Admin)" : `/ ${memberDashboardData?.pooledGoal ?? 5} pts`}
                                                    </span>
                                                </p>
                                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                    {selectedMember.service_points || 0} Serv · {selectedMember.social_points || 0} Soc
                                                </p>
                                            </div>
                                            <div className="w-full bg-slate-200/60 rounded-full h-2 mt-2 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${
                                                        memberDashboardData?.isAdmin
                                                            ? "bg-purple-400"
                                                            : memberDashboardData?.pooledCompleted
                                                            ? "bg-emerald-500"
                                                            : "bg-amber-500"
                                                    }`}
                                                    style={{
                                                        width: memberDashboardData?.isAdmin
                                                            ? "100%"
                                                            : `${Math.min(((memberDashboardData?.pooledPoints ?? 0) / (memberDashboardData?.pooledGoal ?? 5)) * 100, 100)}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Total Points */}
                                        <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Total Points</span>
                                                    {memberDashboardData?.isAdmin ? (
                                                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-sm">Exempt</span>
                                                    ) : memberDashboardData?.totalCompleted ? (
                                                        <span className="text-[10px] font-bold text-emerald-600">✓ Completed</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-amber-600">Incomplete</span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-extrabold text-slate-800">
                                                    {memberDashboardData?.totalPoints ?? 0}{" "}
                                                    <span className="text-xs text-slate-400 font-medium">
                                                        {memberDashboardData?.isAdmin ? "pts (Admin)" : `/ ${memberDashboardData?.totalGoal ?? 10} pts`}
                                                    </span>
                                                </p>
                                            </div>
                                            <div className="w-full bg-slate-200/60 rounded-full h-2 mt-4 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${
                                                        memberDashboardData?.isAdmin
                                                            ? "bg-purple-400"
                                                            : memberDashboardData?.totalCompleted
                                                            ? "bg-emerald-500"
                                                            : "bg-amber-500"
                                                    }`}
                                                    style={{
                                                        width: memberDashboardData?.isAdmin
                                                            ? "100%"
                                                            : `${Math.min(((memberDashboardData?.totalPoints ?? 0) / (memberDashboardData?.totalGoal ?? 10)) * 100, 100)}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Strikes */}
                                        <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Active Strikes</span>
                                                    {memberDashboardData?.isAdmin ? (
                                                        <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-sm">Exempt</span>
                                                    ) : memberStrikes.length >= 2 ? (
                                                        <span className="text-[10px] font-bold text-rose-600">Threshold Danger</span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-emerald-600">Good Standing</span>
                                                    )}
                                                </div>
                                                <p className="text-xl font-extrabold text-slate-800">
                                                    {memberDashboardData?.isAdmin ? 0 : memberStrikes.length}{" "}
                                                    <span className="text-xs text-slate-400 font-medium">
                                                        {memberDashboardData?.isAdmin ? "· No strikes for admins" : "/ 3 limit"}
                                                    </span>
                                                </p>
                                            </div>
                                            <div className="w-full bg-slate-200/60 rounded-full h-2 mt-4 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-300 ${
                                                        memberDashboardData?.isAdmin
                                                            ? "bg-purple-400"
                                                            : memberStrikes.length >= 2
                                                            ? "bg-rose-500"
                                                            : "bg-emerald-500"
                                                    }`}
                                                    style={{
                                                        width: memberDashboardData?.isAdmin
                                                            ? "0%"
                                                            : `${Math.min((memberStrikes.length / 3) * 100, 100)}%`,
                                                    }}
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
                                                                        Attended
                                                                    </span>
                                                                )}
                                                                {status === "excused" && (
                                                                    <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-bold rounded-lg border border-amber-100 text-[10px]">
                                                                        Excused
                                                                    </span>
                                                                )}
                                                                {status === "missed" && (
                                                                    <span className="px-2 py-0.5 bg-rose-50 text-rose-700 font-bold rounded-lg border border-rose-100 text-[10px]">
                                                                        Missed
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
                                            <div className="border-b border-slate-100 pb-3 mb-3 flex items-center justify-between gap-2">
                                                <div>
                                                    <h3 className="font-bold text-slate-800 text-sm tracking-wide uppercase">Point Breakdown</h3>
                                                    <p className="text-[11px] text-slate-400 mt-0.5">Breakdown of requirements earned by categories</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleRefreshPoints}
                                                    disabled={isRefreshingPoints || isPending}
                                                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-300/80 text-emerald-800 transition-all shadow-2xs hover:shadow-xs cursor-pointer shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                                                    title="Refresh points to align with attendance breakdown"
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        width="12"
                                                        height="12"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2.5"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        className={`text-emerald-600 ${isRefreshingPoints ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"}`}
                                                    >
                                                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                                                    </svg>
                                                    <span className="font-semibold text-xs tracking-tight normal-case text-emerald-800">
                                                        {isRefreshingPoints ? "Refreshing..." : "Refresh Points"}
                                                    </span>
                                                </button>
                                            </div>

                                            {memberDashboardData && (
                                                <div className="overflow-y-auto max-h-[300px] space-y-4 pr-1">
                                                    
                                                    {/* Professional Category */}
                                                    <div>
                                                        <h5 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between">
                                                            <span>Professional ({selectedMember.professional_points || 0} pts)</span>
                                                            <span className="text-slate-500">Goal: {memberDashboardData.pGoal}</span>
                                                        </h5>
                                                        {memberDashboardData.pointsBreakdown.professional.length === 0 && selectedManualPoints.professional === 0 ? (
                                                            <p className="text-[10px] text-slate-400 italic">No professional check-ins recorded.</p>
                                                        ) : (
                                                            <ul className="space-y-1">
                                                                {memberDashboardData.pointsBreakdown.professional.map(e => {
                                                                    const isMandatoryForNew = Boolean(selectedMember.is_new_member) && isNewMemberMandatory(e);
                                                                    const pts = isMandatoryForNew ? 0 : (e.points || 1);

                                                                    return (
                                                                        <li key={e.id} className="p-1.5 bg-slate-50 rounded-lg text-[11px] font-semibold text-slate-700 flex justify-between items-center gap-2">
                                                                            <span className="truncate">✓ {e.name}</span>
                                                                            {isMandatoryForNew ? (
                                                                                <span className="inline-flex items-center gap-1.5 shrink-0">
                                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">
                                                                                        New Member Mandatory
                                                                                    </span>
                                                                                    <span className="text-slate-400 font-bold">+0</span>
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-amber-700 font-bold shrink-0">+{pts}</span>
                                                                            )}
                                                                        </li>
                                                                    );
                                                                })}
                                                                {selectedManualPoints.professional !== 0 && (
                                                                    <li className={`p-1.5 rounded-lg text-[11px] font-semibold flex justify-between ${
                                                                        selectedManualPoints.professional > 0
                                                                            ? "bg-amber-50/80 border border-amber-200/60 text-slate-700"
                                                                            : "bg-rose-50/80 border border-rose-200/60 text-slate-700"
                                                                    }`}>
                                                                        <span className="flex items-center gap-1">
                                                                            <span className={selectedManualPoints.professional > 0 ? "text-amber-600 font-bold" : "text-rose-600 font-bold"}>★</span>
                                                                            <span>Admin Manual Adjustment</span>
                                                                        </span>
                                                                        <span className={`font-bold ${selectedManualPoints.professional > 0 ? "text-amber-700" : "text-rose-700"}`}>
                                                                            {selectedManualPoints.professional > 0 ? `+${selectedManualPoints.professional}` : selectedManualPoints.professional}
                                                                        </span>
                                                                    </li>
                                                                )}
                                                            </ul>
                                                        )}
                                                    </div>

                                                    {/* Social Category */}
                                                    <div>
                                                        <h5 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between">
                                                            <span>Social ({selectedMember.social_points || 0} pts)</span>
                                                            <span className="text-slate-500">Pooled Goal: {memberDashboardData.pooledGoal}</span>
                                                        </h5>
                                                        {memberDashboardData.pointsBreakdown.social.length === 0 && selectedManualPoints.social === 0 ? (
                                                            <p className="text-[10px] text-slate-400 italic">No social check-ins recorded.</p>
                                                        ) : (
                                                            <ul className="space-y-1">
                                                                {memberDashboardData.pointsBreakdown.social.map(e => {
                                                                    const isMandatoryForNew = Boolean(selectedMember.is_new_member) && isNewMemberMandatory(e);
                                                                    const pts = isMandatoryForNew ? 0 : (e.points || 1);

                                                                    return (
                                                                        <li key={e.id} className="p-1.5 bg-slate-50 rounded-lg text-[11px] font-semibold text-slate-700 flex justify-between items-center gap-2">
                                                                            <span className="truncate">✓ {e.name}</span>
                                                                            {isMandatoryForNew ? (
                                                                                <span className="inline-flex items-center gap-1.5 shrink-0">
                                                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 uppercase">
                                                                                        New Member Mandatory
                                                                                    </span>
                                                                                    <span className="text-slate-400 font-bold">+0</span>
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-amber-700 font-bold shrink-0">+{pts}</span>
                                                                            )}
                                                                        </li>
                                                                    );
                                                                })}
                                                                {selectedManualPoints.social !== 0 && (
                                                                    <li className={`p-1.5 rounded-lg text-[11px] font-semibold flex justify-between ${
                                                                        selectedManualPoints.social > 0
                                                                            ? "bg-amber-50/80 border border-amber-200/60 text-slate-700"
                                                                            : "bg-rose-50/80 border border-rose-200/60 text-slate-700"
                                                                    }`}>
                                                                        <span className="flex items-center gap-1">
                                                                            <span className={selectedManualPoints.social > 0 ? "text-amber-600 font-bold" : "text-rose-600 font-bold"}>★</span>
                                                                            <span>Admin Manual Adjustment</span>
                                                                        </span>
                                                                        <span className={`font-bold ${selectedManualPoints.social > 0 ? "text-amber-700" : "text-rose-700"}`}>
                                                                            {selectedManualPoints.social > 0 ? `+${selectedManualPoints.social}` : selectedManualPoints.social}
                                                                        </span>
                                                                    </li>
                                                                )}
                                                            </ul>
                                                        )}
                                                    </div>

                                                    {/* Service Category */}
                                                    <div>
                                                        <h5 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between">
                                                            <span>Service ({selectedMember.service_points || 0} pts)</span>
                                                            <span className="text-slate-500">Pooled Goal: {memberDashboardData.pooledGoal}</span>
                                                        </h5>
                                                        {memberDashboardData.pointsBreakdown.service.length === 0 && selectedManualPoints.service === 0 ? (
                                                            <p className="text-[10px] text-slate-400 italic">No service check-ins recorded.</p>
                                                        ) : (
                                                            <ul className="space-y-1">
                                                                {memberDashboardData.pointsBreakdown.service.map(e => (
                                                                    <li key={e.id} className="p-1.5 bg-slate-50 rounded-lg text-[11px] font-semibold text-slate-700 flex justify-between">
                                                                        <span>✓ {e.name}</span>
                                                                        <span className="text-amber-700 font-bold">+{e.points || 1}</span>
                                                                    </li>
                                                                ))}
                                                                {selectedManualPoints.service !== 0 && (
                                                                    <li className={`p-1.5 rounded-lg text-[11px] font-semibold flex justify-between ${
                                                                        selectedManualPoints.service > 0
                                                                            ? "bg-amber-50/80 border border-amber-200/60 text-slate-700"
                                                                            : "bg-rose-50/80 border border-rose-200/60 text-slate-700"
                                                                    }`}>
                                                                        <span className="flex items-center gap-1">
                                                                            <span className={selectedManualPoints.service > 0 ? "text-amber-600 font-bold" : "text-rose-600 font-bold"}>★</span>
                                                                            <span>Admin Manual Adjustment</span>
                                                                        </span>
                                                                        <span className={`font-bold ${selectedManualPoints.service > 0 ? "text-amber-700" : "text-rose-700"}`}>
                                                                            {selectedManualPoints.service > 0 ? `+${selectedManualPoints.service}` : selectedManualPoints.service}
                                                                        </span>
                                                                    </li>
                                                                )}
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
                                                {!memberDashboardData?.isAdmin && (
                                                    <Link
                                                        href={`/users/admin/reviewMemberStats/${selectedMember.id}/addStrike`}
                                                        className="px-2.5 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold rounded-lg transition-colors"
                                                    >
                                                        + Issue Strike
                                                    </Link>
                                                )}
                                            </div>

                                            {memberDashboardData?.isAdmin ? (
                                                <div className="p-4 bg-purple-50/60 text-purple-900 border border-purple-200/80 rounded-xl text-xs font-semibold py-8 text-center space-y-1">
                                                    <p className="font-bold">Officer Account</p>
                                                    <p className="text-[11px] text-purple-700 font-normal">Admins are exempt from point requirements and strikes.</p>
                                                </div>
                                            ) : allMemberStrikes.length === 0 ? (
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
                                                                        <p className="text-[10px] text-slate-400 font-medium">Submitted {formatAbsenceDate(ab.submitted_at)}</p>
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
                                                                                +1 Prof Point
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleUpdatePoints("professional", -1)}
                                                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                                                            >
                                                                                -1 Prof Point
                                                                            </button>
                                                                            
                                                                            <button
                                                                                onClick={() => handleUpdatePoints("social", 1)}
                                                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                                                            >
                                                                                +1 Social Point
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleUpdatePoints("social", -1)}
                                                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                                                            >
                                                                                -1 Social Point
                                                                            </button>

                                                                            <button
                                                                                onClick={() => handleUpdatePoints("service", 1)}
                                                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                                                            >
                                                                                +1 Service Point
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleUpdatePoints("service", -1)}
                                                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                                                            >
                                                                                -1 Service Point
                                                                            </button>

                                                                            {/* Role, PM, New Member, Edit Profile, Deactivate, Email */}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleTogglePM(!selectedMember.is_PM)}
                                                                                disabled={isPending}
                                                                                className={`px-3 py-2 border rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                                                                                    selectedMember.is_PM
                                                                                        ? "bg-purple-50/90 hover:bg-purple-100 text-purple-900 border-purple-300"
                                                                                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/50"
                                                                                }`}
                                                                            >
                                                                                {selectedMember.is_PM ? "Toggle PM (Remove PM)" : "Toggle PM (Make PM)"}
                                                                            </button>

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleToggleNewMember(!selectedMember.is_new_member)}
                                                                                disabled={isPending}
                                                                                className={`px-3 py-2 border rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                                                                                    selectedMember.is_new_member
                                                                                        ? "bg-teal-50/90 hover:bg-teal-100 text-teal-900 border-teal-300"
                                                                                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/50"
                                                                                }`}
                                                                            >
                                                                                {selectedMember.is_new_member ? "Toggle New Member (Remove NM)" : "Toggle New Member (Make NM)"}
                                                                            </button>

                                                                            <button
                                                                                onClick={handlePromoteDemote}
                                                                                disabled={isPending}
                                                                                className={`px-3 py-2 border rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                                                                                    selectedMember.role?.toUpperCase() === "ADMIN"
                                                                                        ? "bg-amber-50/80 hover:bg-amber-100/80 text-amber-800 border-amber-200"
                                                                                        : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/50"
                                                                                }`}
                                                                            >
                                                                                {selectedMember.role?.toUpperCase() === "ADMIN" ? "Change Role (to Member)" : "Change Role (to Admin)"}
                                                                            </button>

                                                                            <button
                                                                                onClick={() => setIsEditModalOpen(true)}
                                                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                                                            >
                                                                                Edit Profile Info
                                                                            </button>

                                                                            <button
                                                                                onClick={handleDeactivate}
                                                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer"
                                                                            >
                                                                                Deactivate Portal
                                                                            </button>

                                                                            <a
                                                                                href={`mailto:${selectedMember.illinois_email}?subject=NOBE%20Status%20Update`}
                                                                                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/50 rounded-xl text-left text-xs font-bold transition-all cursor-pointer flex items-center"
                                                                            >
                                                                                Send Email
                                                                            </a>
                                                                        </div>
                                                                    </div>

                                                                    <button
                                                                        onClick={handleDeleteMemberItem}
                                                                        disabled={isPending}
                                                                        className="w-full mt-4 py-2 text-xs bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold rounded-xl transition-all cursor-pointer text-center"
                                                                    >
                                                                        {isPending ? "Processing..." : "Permanent Delete Member"}
                                                                    </button>
                                                                </section>
                                                            </>
                                                        ) : (
                                                            <section className="panel text-center py-20 text-slate-400">
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
                                <label className="block text-slate-500 font-bold mb-1">Role</label>
                                <select
                                    value={editForm.role}
                                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-colors"
                                >
                                    <option value="MEMBER">MEMBER</option>
                                    <option value="ADMIN">ADMIN</option>
                                </select>
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
                                    placeholder="e.g. Product development, Technology, Consulting"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-colors"
                                />
                            </div>

                            <div className="flex items-start gap-2.5 pt-2 pb-1">
                                <input
                                    type="checkbox"
                                    id="edit_is_pm"
                                    checked={editForm.is_PM}
                                    onChange={(e) => setEditForm({ ...editForm, is_PM: e.target.checked })}
                                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                />
                                <label htmlFor="edit_is_pm" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                                    Project Manager (PM)
                                    <span className="block text-[11px] text-slate-400 font-normal">
                                        Reduces point requirements to 4 Professional + 4 Service/Social (8 total).
                                    </span>
                                </label>
                            </div>

                            <div className="flex items-start gap-2.5 pt-2 pb-1">
                                <input
                                    type="checkbox"
                                    id="edit_is_new_member"
                                    checked={editForm.is_new_member}
                                    onChange={(e) => setEditForm({ ...editForm, is_new_member: e.target.checked })}
                                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                                />
                                <label htmlFor="edit_is_new_member" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                                    New Member
                                    <span className="block text-[11px] text-slate-400 font-normal">
                                        Mark as new member cohort inductee.
                                    </span>
                                </label>
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

function formatMemberYear(year: string | null | undefined): string {
    if (!year) return "";
    const trimmed = year.trim();
    if (!trimmed) return "";
    if (/^\d{4}$/.test(trimmed)) {
        return `'${trimmed.slice(-2)}`;
    }
    if (/^\d{2}$/.test(trimmed)) {
        return `'${trimmed}`;
    }
    return trimmed;
}

function formatAbsenceDate(value: string | null | undefined): string {
    if (!value) return "N/A";
    const clean = value.includes(" ") && !value.includes("T") ? value.replace(" ", "T") : value;
    const normalized = clean.endsWith("Z") || clean.includes("+") || /-\d{2}:\d{2}$/.test(clean) ? clean : `${clean}Z`;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
}