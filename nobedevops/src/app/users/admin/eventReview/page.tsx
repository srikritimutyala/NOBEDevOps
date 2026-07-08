"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import QRCode from "react-qr-code";
import AdminGuard from "../AdminGuard";

type MemberRecord = {
  id: string;
  name: string | null;
  role: string | null;
  auth_id: string | null;
  illinois_email: string | null;
};

type EventRecord = {
  id: string;
  name: string;
  date: string;
  is_mandatory: boolean | null;
  event_type: string | null;
  dresscode: string | null;
  points: number | null;
  location: string | null;
  description: string | null;
  created_at: string;
  qr_code_secret: string | null;
  check_in_starts_at: string | null;
  check_in_ends_at: string | null;
};

type AttendanceRecord = {
  id: string;
  user_id: string;
  event_id: string;
  timestamp: string | null;
};

type AbsenceRecord = {
  id: string;
  user_id: string;
  event_id: string;
  status: string | null;
  reason: string | null;
  submitted_at: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeOnly(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });
}

export default function EventReviewPage() {
  return (
    <Suspense fallback={
      <div className="app-shell">
        <div className="page-frame">
          <div className="panel" style={{ textAlign: "center", padding: "40px" }}>
            <p className="section-copy">Loading event details...</p>
          </div>
        </div>
      </div>
    }>
      <EventReviewClient />
    </Suspense>
  );
}

function EventReviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId") || "";

  // State
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchMember, setSearchMember] = useState("");
  const [tabFilter, setTabFilter] = useState<"ALL" | "PRESENT" | "EXCUSED" | "MISSING">("ALL");

  // Email modal state
  const [emailModal, setEmailModal] = useState<{ isOpen: boolean; type: "ATTENDEES" | "MISSING"; subject: string; body: string } | null>(null);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailProgress, setEmailProgress] = useState({ current: 0, total: 0 });

  async function loadData() {
    if (!eventId) return;
    setLoading(true);
    try {
      const [eventRes, membersRes, attendanceRes, absencesRes] = await Promise.all([
        supabase.from("events").select("*").eq("id", eventId).single(),
        supabase.from("People").select("id, name, role, auth_id, illinois_email").order("name", { ascending: true }),
        supabase.from("attendance").select("*").eq("event_id", eventId),
        supabase.from("excused_absences").select("*").eq("event_id", eventId),
      ]);

      if (eventRes.error) throw eventRes.error;
      setEvent(eventRes.data as EventRecord);
      setMembers((membersRes.data as MemberRecord[]) || []);
      setAttendance((attendanceRes.data as AttendanceRecord[]) || []);
      setAbsences((absencesRes.data as AbsenceRecord[]) || []);
    } catch (err: any) {
      console.error("Error loading event review:", err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Actions
  async function handleMarkPresent(memberAuthId: string) {
    if (!memberAuthId) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from("attendance").insert({
        user_id: memberAuthId,
        event_id: eventId,
        timestamp: new Date().toISOString()
      });
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      alert("Failed to mark present: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveAttendance(memberAuthId: string) {
    if (!memberAuthId) return;
    if (!confirm("Are you sure you want to remove attendance for this member?")) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("attendance")
        .delete()
        .eq("user_id", memberAuthId)
        .eq("event_id", eventId);
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      alert("Failed to remove attendance: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReviewAbsence(absenceId: string, status: "APPROVED" | "DENIED") {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/review-absence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          absenceId,
          status,
          responseMessage: status === "APPROVED" 
            ? "Your excuse request has been approved by the administrators." 
            : "Your excuse request was reviewed and denied."
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit review");
      alert(`Absence request successfully ${status.toLowerCase()}!`);
      await loadData();
    } catch (err: any) {
      alert("Error reviewing absence: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRegenerateQr() {
    if (!event) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/generate-secret/check-in");
      if (!res.ok) throw new Error("Failed to generate QR secret");
      const { secret } = await res.json();
      
      const endsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("events")
        .update({
          qr_code_secret: secret,
          check_in_starts_at: new Date().toISOString(),
          check_in_ends_at: endsAt
        })
        .eq("id", eventId);

      if (error) throw error;
      setEvent(prev => prev ? { ...prev, qr_code_secret: secret, check_in_ends_at: endsAt } : null);
      alert("QR Check-in regenerated and valid for 30 minutes!");
    } catch (err: any) {
      alert("Error regenerating QR: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteEvent() {
    if (!confirm("⚠️ WARNING: Are you sure you want to permanently delete this event? This will also remove all associated attendance and absence records!")) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from("events").delete().eq("id", eventId);
      if (error) throw error;
      router.push("/users/admin/viewAllEvents");
    } catch (err: any) {
      alert("Failed to delete event: " + err.message);
      setActionLoading(false);
    }
  }

  async function handleProcessStrikes() {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/process-strikes", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process strikes");
      alert(data.message || "Strikes processed successfully!");
    } catch (err: any) {
      alert("Error processing strikes: " + err.message);
    } finally {
      setActionLoading(false);
    }
  }

  // Member classifications
  const memberStatuses = useMemo(() => {
    const map: Record<string, { status: "PRESENT" | "EXCUSED" | "MISSING" | "PENDING_EXCUSE"; recordId?: string; time?: string; excuseReason?: string }> = {};
    
    members.forEach((m) => {
      if (!m.auth_id) return;
      
      // 1. Check Attendance
      const att = attendance.find(a => a.user_id === m.auth_id);
      if (att) {
        map[m.auth_id] = { status: "PRESENT", recordId: att.id, time: att.timestamp ? formatTimeOnly(att.timestamp) : undefined };
        return;
      }
      
      // 2. Check Absences
      const abs = absences.find(a => a.user_id === m.auth_id);
      if (abs) {
        if (abs.status?.toUpperCase() === "APPROVED") {
          map[m.auth_id] = { status: "EXCUSED", recordId: abs.id, excuseReason: abs.reason || undefined };
        } else if (abs.status?.toUpperCase() === "PENDING" || !abs.status) {
          map[m.auth_id] = { status: "PENDING_EXCUSE", recordId: abs.id, excuseReason: abs.reason || undefined };
        } else {
          map[m.auth_id] = { status: "MISSING" };
        }
        return;
      }
      
      // Default: Missing
      map[m.auth_id] = { status: "MISSING" };
    });
    
    return map;
  }, [members, attendance, absences]);

  // Statistics Computations
  const stats = useMemo(() => {
    const total = members.length;
    const checkedIn = Object.values(memberStatuses).filter(m => m.status === "PRESENT").length;
    const missing = Object.values(memberStatuses).filter(m => m.status === "MISSING").length;
    const pendingExcuse = Object.values(memberStatuses).filter(m => m.status === "PENDING_EXCUSE").length;
    const rate = total > 0 ? Math.round((checkedIn / total) * 100) : 0;
    
    return { total, checkedIn, missing, pendingExcuse, rate };
  }, [members, memberStatuses]);

  // Filtered members list
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const info = memberStatuses[m.auth_id || ""];
      if (!info) return false;
      
      // Search check
      const matchesSearch = m.name?.toLowerCase().includes(searchMember.toLowerCase().trim()) ||
                            m.illinois_email?.toLowerCase().includes(searchMember.toLowerCase().trim());
      if (!matchesSearch) return false;
      
      // Tab filter check
      if (tabFilter === "PRESENT" && info.status !== "PRESENT") return false;
      if (tabFilter === "EXCUSED" && info.status !== "EXCUSED" && info.status !== "PENDING_EXCUSE") return false;
      if (tabFilter === "MISSING" && info.status !== "MISSING") return false;
      
      return true;
    });
  }, [members, memberStatuses, searchMember, tabFilter]);

  // Absences pending review
  const pendingAbsenceRequests = useMemo(() => {
    return absences
      .filter((abs) => abs.status?.toUpperCase() === "PENDING" || !abs.status)
      .map((abs) => {
        const member = members.find(m => m.auth_id === abs.user_id);
        return {
          id: abs.id,
          name: member?.name || "Unknown Member",
          reason: abs.reason || "No reason provided",
        };
      });
  }, [absences, members]);

  // Activity Log builder
  const activityLogs = useMemo(() => {
    const logs: Array<{ id: string; time: Date; text: string }> = [];
    
    if (event) {
      logs.push({
        id: "created",
        time: new Date(event.created_at),
        text: "Event created"
      });
    }

    attendance.forEach(att => {
      const member = members.find(m => m.auth_id === att.user_id);
      if (att.timestamp) {
        logs.push({
          id: att.id,
          time: new Date(att.timestamp),
          text: `${member?.name || "Someone"} checked in`
        });
      }
    });

    if (event?.check_in_starts_at) {
      logs.push({
        id: "qr_gen",
        time: new Date(event.check_in_starts_at),
        text: "QR code generated"
      });
    }

    logs.sort((a, b) => b.time.getTime() - a.time.getTime());
    return logs;
  }, [event, attendance, members]);

  // CSV Exporter client-side
  function handleExportCsv() {
    if (!event) return;
    const headers = ["Name", "Email", "Role", "Status", "Check-in Time"];
    const rows = members.map((m) => {
      const info = memberStatuses[m.auth_id || ""];
      return [
        m.name || "N/A",
        m.illinois_email || "N/A",
        m.role || "N/A",
        info?.status || "MISSING",
        info?.time || "N/A"
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${event.name.replace(/\s+/g, "_")}_attendance.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Email action trigger
  function handleOpenEmailComposer(type: "ATTENDEES" | "MISSING") {
    if (!event) return;
    const recipientCount = type === "ATTENDEES" 
      ? Object.values(memberStatuses).filter(m => m.status === "PRESENT").length
      : Object.values(memberStatuses).filter(m => m.status === "MISSING").length;

    const defaultSubject = type === "ATTENDEES"
      ? `Thank you for attending: ${event.name}`
      : `Important: You missed mandatory event: ${event.name}`;

    const defaultBody = type === "ATTENDEES"
      ? `Hello,\n\nThank you for checking in to "${event.name}". Your professional attendance has been recorded and point rewards processed.\n\nBest regards,\nNOBE Administration`
      : `Hello,\n\nYou missed the mandatory event "${event.name}" and do not have an approved absence on file. This may result in a strike.\n\nPlease submit an absence form if you have an excuse, or contact executive members.\n\nBest regards,\nNOBE Administration`;

    setEmailModal({
      isOpen: true,
      type,
      subject: defaultSubject,
      body: defaultBody
    });
  }

  async function handleSendEmailBatch() {
    if (!emailModal || !event) return;
    const targetEmails = members
      .filter((m) => {
        if (!m.auth_id || !m.illinois_email) return false;
        const status = memberStatuses[m.auth_id].status;
        if (emailModal.type === "ATTENDEES" && status !== "PRESENT") return false;
        if (emailModal.type === "MISSING" && status !== "MISSING") return false;
        return true;
      })
      .map(m => m.illinois_email as string);

    if (targetEmails.length === 0) {
      alert("No email recipients found for this selection.");
      return;
    }

    if (!confirm(`Are you sure you want to send this email to ${targetEmails.length} members?`)) return;

    setSendingEmails(true);
    setEmailProgress({ current: 0, total: targetEmails.length });

    try {
      for (let i = 0; i < targetEmails.length; i++) {
        const email = targetEmails[i];
        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            subject: emailModal.subject,
            message: emailModal.body
          })
        });
        setEmailProgress(prev => ({ ...prev, current: i + 1 }));
      }
      alert("Successfully dispatched emails to members!");
      setEmailModal(null);
    } catch (err: any) {
      alert("Failed to send emails: " + err.message);
    } finally {
      setSendingEmails(false);
    }
  }

  // QR Expiration
  const qrExpiryStr = useMemo(() => {
    if (!event || !event.check_in_ends_at) return null;
    const diff = new Date(event.check_in_ends_at).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    return `${Math.ceil(diff / 60000)} minutes`;
  }, [event]);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="page-frame">
          <div className="panel" style={{ textAlign: "center", padding: "40px" }}>
            <p className="section-copy">Loading event details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="app-shell">
        <div className="page-frame">
          <div className="panel" style={{ textAlign: "center", padding: "40px" }}>
            <p className="section-copy" style={{ color: "var(--danger)" }}>Event not found.</p>
            <Link href="/users/admin/viewAllEvents" className="btn-secondary" style={{ marginTop: "12px" }}>
              ← Back to Events
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminGuard>
      <div className="app-shell" style={{ padding: "24px 16px", minHeight: "100vh" }}>
        <div className="page-frame page-stack" style={{ maxWidth: "760px", margin: "0 auto", gap: "32px" }}>
          
          {/* Header Section */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Link href="/users/admin/viewAllEvents" style={{ fontSize: "0.85rem", color: "var(--muted)", textDecoration: "none", fontWeight: "600" }}>
                ← Back to Events
              </Link>
              <span style={{ fontSize: "0.85rem", color: "var(--muted)", fontWeight: "600" }}>Event Details</span>
            </div>

            <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "24px" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
                <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "var(--accent-soft)", color: "var(--accent-strong)", borderRadius: "20px", fontWeight: "700" }}>
                  {event.event_type?.replaceAll("_", " ") || "GCAL"}
                </span>
                {event.is_mandatory && (
                  <span style={{ fontSize: "0.75rem", padding: "4px 10px", background: "rgba(154,59,49,0.12)", color: "var(--danger)", borderRadius: "20px", fontWeight: "700" }}>
                    Mandatory
                  </span>
                )}
              </div>
              
              <h1 style={{ fontSize: "2.2rem", fontWeight: "800", letterSpacing: "-0.03em", margin: "0 0 12px 0", color: "#111" }}>{event.name}</h1>
              
              <div style={{ fontSize: "0.95rem", color: "var(--muted)", display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>📅 {formatDate(event.date)}</span>
                {event.location && <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>📍 {event.location}</span>}
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "12px", marginTop: "24px", flexWrap: "wrap" }}>
                <Link href={`/users/admin/createEvent?eventId=${event.id}`} className="btn" style={{ padding: "10px 20px", fontWeight: "600", textDecoration: "none", borderRadius: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  ✏️ Edit Event
                </Link>
                <button
                  type="button"
                  onClick={handleRegenerateQr}
                  disabled={actionLoading}
                  className="btn-secondary"
                  style={{ padding: "10px 20px", fontWeight: "600", borderRadius: "12px", cursor: "pointer" }}
                >
                  🔄 Generate QR
                </button>
                <button
                  type="button"
                  onClick={handleDeleteEvent}
                  disabled={actionLoading}
                  className="btn-secondary"
                  style={{ borderColor: "var(--danger)", color: "var(--danger)", padding: "10px 20px", fontWeight: "600", borderRadius: "12px", cursor: "pointer", marginLeft: "auto" }}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>

          {/* Section 1 — Quick Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
            {/* Card 1: Attendance Present */}
            <div className="panel" style={{ padding: "20px", borderRadius: "20px", background: "var(--surface-strong)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>Attendance</span>
              <strong style={{ fontSize: "1.7rem", fontWeight: "800", color: "var(--success)" }}>{stats.checkedIn} Checked In</strong>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Out of {stats.total} members</span>
            </div>
            
            {/* Card 2: Attendance Missing */}
            <div className="panel" style={{ padding: "20px", borderRadius: "20px", background: "var(--surface-strong)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>Missing / Rate</span>
              <strong style={{ fontSize: "1.7rem", fontWeight: "800", color: "var(--danger)" }}>{stats.missing} Missing</strong>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{stats.rate}% Attendance Rate</span>
            </div>

            {/* Card 3: Points Awarded */}
            <div className="panel" style={{ padding: "20px", borderRadius: "20px", background: "var(--surface-strong)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>Points Awarded</span>
              <strong style={{ fontSize: "1.7rem", fontWeight: "800", color: "var(--accent-strong)" }}>{event.points ?? 0} {event.event_type ? event.event_type.split("_")[0].toLowerCase() : "event"}</strong>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Points per member</span>
            </div>

            {/* Card 4: Absence Requests */}
            <div className="panel" style={{ padding: "20px", borderRadius: "20px", background: "var(--surface-strong)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>Absence Requests</span>
              <strong style={{ fontSize: "1.7rem", fontWeight: "800", color: "#e65100" }}>{stats.pendingExcuse} Pending</strong>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Excuse forms pending review</span>
            </div>
          </div>

          {/* Section 2 — Attendance Sheet */}
          <section className="panel" style={{ padding: "24px", borderRadius: "24px", background: "var(--surface-strong)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "800", margin: "0 0 6px 0", color: "#111" }}>Attendance</h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.82rem", color: "var(--muted)" }}>Search members and track present, excused, or missing status.</p>

            {/* Search and Tabs */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
              <input
                type="text"
                placeholder="Search member..."
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                className="field-input"
                style={{ width: "100%", height: "42px", padding: "0 16px", borderRadius: "12px", border: "1px solid var(--border)", background: "#fcfcfc" }}
              />

              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setTabFilter("ALL")}
                  className="btn-secondary"
                  style={{ fontSize: "0.78rem", minHeight: "30px", padding: "4px 12px", borderRadius: "20px", background: tabFilter === "ALL" ? "rgba(0,0,0,0.05)" : "transparent", borderColor: "var(--border)" }}
                >
                  All ({members.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTabFilter("PRESENT")}
                  className="btn-secondary"
                  style={{ fontSize: "0.78rem", minHeight: "30px", padding: "4px 12px", borderRadius: "20px", background: tabFilter === "PRESENT" ? "rgba(63,122,83,0.08)" : "transparent", color: tabFilter === "PRESENT" ? "var(--success)" : "var(--foreground)", borderColor: tabFilter === "PRESENT" ? "var(--success)" : "var(--border)" }}
                >
                  Present ({stats.checkedIn})
                </button>
                <button
                  type="button"
                  onClick={() => setTabFilter("EXCUSED")}
                  className="btn-secondary"
                  style={{ fontSize: "0.78rem", minHeight: "30px", padding: "4px 12px", borderRadius: "20px", background: tabFilter === "EXCUSED" ? "rgba(229,138,39,0.08)" : "transparent", color: tabFilter === "EXCUSED" ? "var(--accent-strong)" : "var(--foreground)", borderColor: tabFilter === "EXCUSED" ? "var(--accent-strong)" : "var(--border)" }}
                >
                  Excused ({absences.filter(a => a.status === "APPROVED" || a.status === "PENDING" || !a.status).length})
                </button>
                <button
                  type="button"
                  onClick={() => setTabFilter("MISSING")}
                  className="btn-secondary"
                  style={{ fontSize: "0.78rem", minHeight: "30px", padding: "4px 12px", borderRadius: "20px", background: tabFilter === "MISSING" ? "rgba(154,59,49,0.08)" : "transparent", color: tabFilter === "MISSING" ? "var(--danger)" : "var(--foreground)", borderColor: tabFilter === "MISSING" ? "var(--danger)" : "var(--border)" }}
                >
                  Missing ({stats.missing})
                </button>
              </div>
            </div>

            {/* Member rows */}
            <div style={{ display: "flex", flexDirection: "column", maxHeight: "420px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "14px", background: "white" }}>
              {filteredMembers.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)", fontSize: "0.9rem" }}>No members found.</div>
              ) : (
                filteredMembers.map((member, idx) => {
                  const info = memberStatuses[member.auth_id || ""];
                  if (!info) return null;
                  
                  // Status Pills configuration
                  let badgeBg = "rgba(107,108,112,0.08)";
                  let badgeColor = "var(--muted)";
                  let badgeText = "Missing";

                  if (info.status === "PRESENT") {
                    badgeBg = "rgba(63,122,83,0.1)";
                    badgeColor = "var(--success)";
                    badgeText = "✓ Checked In";
                  } else if (info.status === "EXCUSED") {
                    badgeBg = "rgba(229,138,39,0.1)";
                    badgeColor = "var(--accent-strong)";
                    badgeText = "Excused";
                  } else if (info.status === "PENDING_EXCUSE") {
                    badgeBg = "rgba(229,138,39,0.18)";
                    badgeColor = "#e65100";
                    badgeText = "Pending Excuse";
                  } else {
                    badgeBg = "rgba(154,59,49,0.1)";
                    badgeColor = "var(--danger)";
                    badgeText = "❌ Missing";
                  }

                  return (
                    <div
                      key={member.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "16px",
                        borderBottom: idx < filteredMembers.length - 1 ? "1px solid var(--border)" : "none",
                        flexWrap: "wrap",
                        gap: "12px"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "700", color: "#222", fontSize: "0.95rem" }}>{member.name || "Unnamed"}</div>
                        {info.status === "PRESENT" && info.time ? (
                          <div style={{ fontSize: "0.78rem", color: "var(--success)", fontWeight: "600", marginTop: "2px" }}>
                            {badgeText} · {info.time}
                          </div>
                        ) : (
                          <div style={{ fontSize: "0.78rem", color: badgeColor, fontWeight: "600", marginTop: "2px" }}>
                            {badgeText}
                          </div>
                        )}
                        {info.excuseReason && (
                          <div style={{ fontSize: "0.78rem", color: "var(--muted)", fontStyle: "italic", marginTop: "4px", background: "#fcfcfc", padding: "6px 10px", borderRadius: "8px", border: "1px dashed var(--border)", display: "inline-block" }}>
                            Reason: "{info.excuseReason}"
                          </div>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {info.status === "PRESENT" ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveAttendance(member.auth_id!)}
                            disabled={actionLoading}
                            className="btn-secondary"
                            style={{ fontSize: "0.78rem", minHeight: "32px", padding: "4px 10px", color: "var(--danger)", borderColor: "rgba(154,59,49,0.2)", borderRadius: "8px", cursor: "pointer" }}
                          >
                            Remove Attendance
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMarkPresent(member.auth_id!)}
                            disabled={actionLoading || !member.auth_id}
                            className="btn"
                            style={{ fontSize: "0.78rem", minHeight: "32px", padding: "4px 10px", borderRadius: "8px", cursor: "pointer" }}
                          >
                            Mark Present
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Section 4 — Absence Requests */}
          <section className="panel" style={{ padding: "24px", borderRadius: "24px", background: "var(--surface-strong)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "800", margin: "0 0 6px 0", color: "#111" }}>Pending Requests</h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.82rem", color: "var(--muted)" }}>Review and manage excuse forms submitted by absent members.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {pendingAbsenceRequests.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", background: "#fafafa", borderRadius: "12px", border: "1px dashed var(--border)" }}>
                  No pending excuse requests.
                </div>
              ) : (
                pendingAbsenceRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      padding: "16px",
                      border: "1px solid var(--border)",
                      borderRadius: "16px",
                      background: "#fafafa",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "0.95rem", color: "#111" }}>{req.name}</strong>
                      <span style={{ fontSize: "0.75rem", padding: "3px 8px", background: "rgba(229,138,39,0.12)", color: "var(--accent-strong)", borderRadius: "6px", fontWeight: "700" }}>Awaiting Review</span>
                    </div>
                    <p style={{ fontSize: "0.88rem", color: "var(--foreground)", fontStyle: "italic", margin: 0, padding: "8px 12px", background: "white", borderRadius: "8px", border: "1px solid #eee" }}>
                      "{req.reason}"
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => handleReviewAbsence(req.id, "APPROVED")}
                        disabled={actionLoading}
                        className="btn"
                        style={{ flex: 1, fontSize: "0.8rem", padding: "8px 12px", minHeight: "34px", background: "var(--success)", border: "none", color: "white", borderRadius: "8px", cursor: "pointer" }}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewAbsence(req.id, "DENIED")}
                        disabled={actionLoading}
                        className="btn-secondary"
                        style={{ flex: 1, fontSize: "0.8rem", padding: "8px 12px", minHeight: "34px", color: "var(--danger)", borderColor: "rgba(154,59,49,0.25)", borderRadius: "8px", cursor: "pointer" }}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Section 3 — QR Check-In */}
          <section className="panel" style={{ padding: "24px", borderRadius: "24px", background: "var(--surface-strong)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "100%", textAlign: "left" }}>
              <h2 style={{ fontSize: "1.25rem", fontWeight: "800", margin: "0 0 6px 0", color: "#111" }}>QR Check-In</h2>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--muted)" }}>Display this QR code or share the URL during meetings for automated check-in.</p>
            </div>

            {event.qr_code_secret ? (
              <div style={{ background: "white", padding: "16px", borderRadius: "16px", border: "1px solid var(--border)", display: "inline-block" }}>
                <QRCode
                  value={`${window.location.origin}/check-in/${event.qr_code_secret}`}
                  size={180}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                />
              </div>
            ) : (
              <div style={{ width: "180px", height: "180px", background: "#f9f9f9", borderRadius: "16px", border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "0.85rem", textAlign: "center", padding: "12px" }}>
                No QR code generated yet. Click generate below.
              </div>
            )}

            <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              {qrExpiryStr && (
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 8px 0" }}>
                  ⏳ Expires in: <strong>{qrExpiryStr}</strong>
                </p>
              )}

              <div style={{ display: "flex", gap: "10px", width: "100%", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (!event.qr_code_secret) return alert("Please generate a QR code first!");
                    const checkinLink = `${window.location.origin}/check-in/${event.qr_code_secret}`;
                    navigator.clipboard.writeText(checkinLink);
                    alert("Check-in link copied!");
                  }}
                  disabled={!event.qr_code_secret}
                  className="btn"
                  style={{ flex: 1, fontSize: "0.85rem", padding: "10px 14px", borderRadius: "8px", cursor: "pointer" }}
                >
                  📋 Copy Check-in Link
                </button>

                <button
                  type="button"
                  onClick={handleRegenerateQr}
                  disabled={actionLoading}
                  className="btn-secondary"
                  style={{ flex: 1, fontSize: "0.85rem", padding: "10px 14px", borderRadius: "8px", cursor: "pointer" }}
                >
                  Regenerate QR
                </button>
              </div>
            </div>
          </section>

          {/* Section 5 — Event Information */}
          <section className="panel" style={{ padding: "24px", borderRadius: "24px", background: "var(--surface-strong)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "800", margin: "0 0 16px 0", color: "#111" }}>Event Information</h2>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {event.description && (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase" }}>Description</span>
                  <p style={{ margin: 0, color: "var(--foreground)", fontSize: "0.9rem", lineHeight: "1.5", whiteSpace: "pre-wrap", background: "#fafafa", padding: "12px", borderRadius: "10px", border: "1px solid #f0f0f0" }}>
                    {event.description}
                  </p>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "8px" }}>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase" }}>Location</span>
                  <p style={{ margin: "2px 0 0 0", fontWeight: "600", color: "#333", fontSize: "0.92rem" }}>{event.location || "TBD"}</p>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase" }}>Category</span>
                  <p style={{ margin: "2px 0 0 0", fontWeight: "600", color: "#333", fontSize: "0.92rem" }}>{event.event_type?.replaceAll("_", " ")}</p>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase" }}>Points Value</span>
                  <p style={{ margin: "2px 0 0 0", fontWeight: "600", color: "#333", fontSize: "0.92rem" }}>{event.points ?? 0} pt{event.points === 1 ? "" : "s"}</p>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase" }}>Mandatory</span>
                  <p style={{ margin: "2px 0 0 0", fontWeight: "600", color: "#333", fontSize: "0.92rem" }}>{event.is_mandatory ? "Yes" : "No"}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 6 — Activity */}
          <section className="panel" style={{ padding: "24px", borderRadius: "24px", background: "var(--surface-strong)", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "800", margin: "0 0 12px 0", color: "#111" }}>Recent Activity</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "200px", overflowY: "auto" }}>
              {activityLogs.length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>No activity recorded yet.</p>
              ) : (
                activityLogs.map((log, idx) => (
                  <div key={log.id || idx} style={{ display: "flex", gap: "8px", fontSize: "0.82rem", alignItems: "flex-start", borderBottom: idx < activityLogs.length - 1 ? "1px solid #f5f5f5" : "none", paddingBottom: "6px" }}>
                    <span style={{ color: "var(--muted)", whiteSpace: "nowrap", width: "70px" }}>
                      {log.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span style={{ color: "#333" }}>{log.text}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Section 7 — Post-Event Actions */}
          <section className="panel" style={{ padding: "24px", borderRadius: "24px", background: "rgba(255,251,247,0.8)", border: "1px solid rgba(229,138,39,0.25)" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: "800", margin: "0 0 6px 0", color: "var(--accent-strong)" }}>Post-Event Actions</h2>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.82rem", color: "var(--muted)" }}>Complete administrative processing once this event has concluded.</p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }} className="mobile-stack-buttons">
              <style jsx>{`
                @media (max-width: 520px) {
                  .mobile-stack-buttons {
                    grid-template-columns: 1fr !important;
                  }
                }
              `}</style>
              <button
                type="button"
                onClick={handleProcessStrikes}
                disabled={actionLoading}
                className="btn"
                style={{ fontSize: "0.85rem", padding: "10px 14px", borderRadius: "8px", cursor: "pointer" }}
              >
                Process Strikes
              </button>



              <button
                type="button"
                onClick={() => handleOpenEmailComposer("ATTENDEES")}
                className="btn-secondary"
                style={{ fontSize: "0.85rem", padding: "10px 14px", borderRadius: "8px", cursor: "pointer" }}
              >
                Email Attendees
              </button>

              <button
                type="button"
                onClick={() => handleOpenEmailComposer("MISSING")}
                className="btn-secondary"
                style={{ fontSize: "0.85rem", padding: "10px 14px", borderRadius: "8px", cursor: "pointer" }}
              >
                Email Missing Members
              </button>
            </div>
          </section>

          {/* Email Composer Modal Dialog */}
          {emailModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: "20px",
                backdropFilter: "blur(4px)"
              }}
              onClick={() => { if (!sendingEmails) setEmailModal(null); }}
            >
              <div
                className="panel"
                style={{
                  width: "100%",
                  maxWidth: "500px",
                  background: "var(--surface-strong)",
                  padding: "24px",
                  borderRadius: "24px",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
                  border: "1px solid var(--border)"
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ fontSize: "1.2rem", fontWeight: "800", marginBottom: "14px", color: "#111" }}>
                  Compose Email ({emailModal.type === "ATTENDEES" ? "Attendees" : "Missing Members"})
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: "700", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Subject</label>
                    <input
                      type="text"
                      value={emailModal.subject}
                      onChange={(e) => setEmailModal(prev => prev ? { ...prev, subject: e.target.value } : null)}
                      className="field-input"
                      style={{ width: "100%", height: "38px", paddingLeft: "10px", borderRadius: "8px", border: "1px solid var(--border)" }}
                      disabled={sendingEmails}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: "700", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Message</label>
                    <textarea
                      rows={6}
                      value={emailModal.body}
                      onChange={(e) => setEmailModal(prev => prev ? { ...prev, body: e.target.value } : null)}
                      className="field-input"
                      style={{ width: "100%", padding: "10px", borderRadius: "8px", fontFamily: "inherit", fontSize: "0.88rem", border: "1px solid var(--border)" }}
                      disabled={sendingEmails}
                    />
                  </div>
                </div>

                {sendingEmails && (
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", marginBottom: "4px" }}>
                      <span>Sending...</span>
                      <span>{emailProgress.current} / {emailProgress.total}</span>
                    </div>
                    <div style={{ width: "100%", height: "6px", background: "var(--surface-alt)", borderRadius: "3px", overflow: "hidden" }}>
                      <div style={{ width: `${(emailProgress.current / emailProgress.total) * 100}%`, height: "100%", background: "var(--accent)" }} />
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={handleSendEmailBatch}
                    disabled={sendingEmails}
                    className="btn"
                    style={{ flex: 1, fontSize: "0.85rem", padding: "10px", borderRadius: "8px", cursor: "pointer" }}
                  >
                    Send Email
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmailModal(null)}
                    disabled={sendingEmails}
                    className="btn-secondary"
                    style={{ flex: 1, fontSize: "0.85rem", padding: "10px", borderRadius: "8px", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </AdminGuard>
  );
}
