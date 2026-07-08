"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";
import { createClient } from "@/app/utils/supabase/client";
import { useRouter } from "next/navigation";

export type AdminDashboardProps = {
  adminName: string;
  quickStats: {
    totalMembers: number;
    upcomingEvents: number;
    pendingAbsences: number;
    atRiskMembers: number;
    attendanceRate: number | null;
    totalStrikes: number;
    completedRequirements: number;
  };
  needsAttention: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    link?: string;
    action?: string;
    eventId?: string;
  }>;
  upcomingEvents: Array<{
    id: string;
    name: string;
    date: string;
    is_mandatory: boolean;
    event_type: string;
    qr_code_secret: string | null;
    dresscode?: string | null;
  }>;
  qrEvents: Array<{
    id: string;
    name: string;
    date: string;
    qr_code_secret: string;
  }>;
  attendanceOverview: {
    lastEventRate: number | null;
    lastEventName: string | null;
    averageRate: number | null;
    missedMandatoryCount: number;
  };
  membersAtRisk: Array<{
    id: string;
    name: string;
    strikes: number;
    professionalPoints: string;
    servicePoints: string;
    socialPoints: string;
    reason: string;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
  }>;
  clubProgress: {
    professionalCompleted: number;
    socialCompleted: number;
    serviceCompleted: number;
    totalMembers: number;
  };
  systemHealth: {
    supabaseStatus: "healthy" | "error";
    gcalSyncStatus: string;
    cronStatus: "running" | "error" | "stopped";
    emailStatus: "healthy" | "error";
  };
};

export default function AdminDashboard({
  adminName,
  quickStats,
  needsAttention,
  upcomingEvents,
  qrEvents,
  attendanceOverview,
  membersAtRisk,
  recentActivity,
  clubProgress,
  systemHealth,
}: AdminDashboardProps) {
  const supabase = createClient();
  const router = useRouter();

  const [dismissedList, setDismissedList] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nobe_dismissed_notifications");
      if (saved) {
        try {
          setDismissedList(JSON.parse(saved));
        } catch (_) {}
      }
    }
  }, []);

  const handleDismissNotification = (uniqueId: string) => {
    const newList = [...dismissedList, uniqueId];
    setDismissedList(newList);
    localStorage.setItem("nobe_dismissed_notifications", JSON.stringify(newList));
  };

  const visibleNotifications = useMemo(() => {
    return needsAttention.filter(item => {
      const uniqueKey = item.id === "two_strikes" ? `two_strikes_${item.title}` : item.id;
      return !dismissedList.includes(uniqueKey);
    });
  }, [needsAttention, dismissedList]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Sign out failed", e);
    }
    router.replace("/users/login");
  }

  // UI states for interactive features
  const [activeQrEvent, setActiveQrEvent] = useState<{ id: string; name: string; secret: string } | null>(null);
  const [isQrSelectorOpen, setIsQrSelectorOpen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  
  // Strike Processor state
  const [isProcessingStrikes, setIsProcessingStrikes] = useState(false);
  const [strikeProcessResult, setStrikeProcessResult] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState<string | null>(null);

  // Sync state
  const [isSyncingGcal, setIsSyncingGcal] = useState(false);
  const [gcalSyncTimeStr, setGcalSyncTimeStr] = useState<string>(systemHealth.gcalSyncStatus);

  // Email Reminder state
  const [remindingEventId, setRemindingEventId] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);

  const qrRef = useRef<HTMLDivElement>(null);

  // Run strike processor action
  async function triggerStrikeProcessor() {
    setIsProcessingStrikes(true);
    setStrikeProcessResult(null);
    try {
      const res = await fetch("/api/admin/process-strikes", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        if (data.results && data.results.length > 0) {
          const summary = data.results
            .map((r: any) => `${r.event}: ${r.struckCount} strike(s)`)
            .join(", ");
          setStrikeProcessResult(`Success! Processed strikes: ${summary}`);
        } else {
          setStrikeProcessResult(data.message || "Strikes up to date. No events required processing.");
        }
      } else {
        setStrikeProcessResult(data.error || "Failed to process strikes.");
      }
    } catch (err) {
      setStrikeProcessResult("An unexpected error occurred while processing strikes.");
    } finally {
      setIsProcessingStrikes(false);
      router.refresh();
      // Auto hide after 8s
      setTimeout(() => setStrikeProcessResult(null), 8000);
    }
  }

  async function handleMarkStrikesResolved(eventId: string) {
    if (!eventId) return;
    setIsResolving(eventId);
    try {
      const { error } = await supabase
        .from("events")
        .update({ strikes_processed: true })
        .eq("id", eventId);

      if (error) throw error;
      alert("Event marked as strikes processed. Notification resolved.");
      router.refresh();
    } catch (err: any) {
      alert("Error marking event as resolved: " + err.message);
    } finally {
      setIsResolving(null);
    }
  }

  // Trigger Google Calendar Sync
  async function triggerGcalSync() {
    setIsSyncingGcal(true);
    try {
      const res = await fetch("/api/gcal-club/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok && !data.error) {
        setGcalSyncTimeStr("Just synced");
        alert("Google Calendar synced successfully!");
      } else {
        alert(data.error || "Failed to sync Google Calendar.");
      }
    } catch {
      alert("Failed to sync Google Calendar.");
    } finally {
      setIsSyncingGcal(false);
    }
  }

  // Trigger email reminders
  async function triggerEmailReminder(eventId: string, eventName: string) {
    setRemindingEventId(eventId);
    setReminderMessage(null);
    try {
      // Find all member emails by mock trigger or digest alert.
      // We will send a mock broadcast notification to nobeadmintest@gmail.com
      // demonstrating integration with GAS email pipeline
      const testEmail = "nobeadmintest@gmail.com";
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: testEmail,
          subject: `NOBE Event Reminder: ${eventName}`,
          message: `This is a reminder that the event "${eventName}" is coming up! Please make sure to check in.\n\nBest regards,\nNOBE Administration`,
        }),
      });

      if (res.ok) {
        setReminderMessage(`Reminder sent successfully!`);
      } else {
        setReminderMessage("Failed to send reminder email.");
      }
    } catch {
      setReminderMessage("Failed to send reminder.");
    } finally {
      setRemindingEventId(null);
      setTimeout(() => setReminderMessage(null), 4000);
    }
  }

  // Download QR Code as Image
  function handleDownloadQrCode() {
    setDownloadError(null);
    if (!qrRef.current) {
      setDownloadError("QR code is not available.");
      return;
    }
    const svg = qrRef.current.querySelector("svg");
    if (!svg) {
      setDownloadError("Unable to locate QR code image.");
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setDownloadError("Unable to create canvas context.");
          URL.revokeObjectURL(url);
          return;
        }
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (!blob) {
            setDownloadError("Failed to generate download image.");
            URL.revokeObjectURL(url);
            return;
          }
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = `${
            activeQrEvent?.name.trim().replace(/\s+/g, "-").toLowerCase() || "event"
          }-qr.png`;
          link.click();
          URL.revokeObjectURL(link.href);
          URL.revokeObjectURL(url);
        }, "image/png");
      } catch {
        setDownloadError("Download failed.");
      }
    };
    img.src = url;
  }

  // Format activity feed timestamps
  function formatRelativeActivity(timestamp: string) {
    const actTime = new Date(timestamp).getTime();
    const diff = Date.now() - actTime;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  }

  return (
    <div className="space-y-8">
      {/* Welcome Banner / Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <img
              src="/nobe_logo_f.svg"
              alt="NOBE Illinois"
              style={{ width: "52px", height: "52px" }}
            />
            <div>
              <p className="eyebrow" style={{ marginBottom: "2px" }}>Administration</p>
              <h1 className="page-title" style={{ fontSize: "2.4rem", fontWeight: 800 }}>
                Welcome back, {adminName}!
              </h1>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleLogout}
            className="btn-secondary"
            style={{ fontSize: "0.85rem", padding: "8px 16px", borderRadius: "12px", cursor: "pointer" }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Live strike processing feedback */}
      {strikeProcessResult && (
        <div
          className={`p-4 rounded-2xl text-sm font-semibold flex items-center justify-between shadow-xs transition-all ${
            strikeProcessResult.startsWith("Success")
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-amber-50 text-amber-800 border border-amber-200"
          }`}
        >
          <span>{strikeProcessResult}</span>
          <button onClick={() => setStrikeProcessResult(null)} className="text-xs underline hover:no-underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Live event reminder feedback */}
      {reminderMessage && (
        <div className="p-4 bg-blue-50 text-blue-800 border border-blue-200 rounded-2xl text-sm font-semibold">
          {reminderMessage}
        </div>
      )}

      {/* Top Row: Quick Stats */}
      <section className="stats-grid">
        <Link href="/users/admin/reviewMemberStats" className="stat-card hover:-translate-y-0.5 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="stat-label">Total Members</p>
              <p className="stat-value">{quickStats.totalMembers}</p>
            </div>
            <span className="text-2xl p-2 bg-slate-100 rounded-xl">👥</span>
          </div>
        </Link>

        <Link href="/users/admin/viewAllEvents" className="stat-card hover:-translate-y-0.5 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="stat-label">Upcoming Events</p>
              <p className="stat-value">{quickStats.upcomingEvents}</p>
            </div>
            <span className="text-2xl p-2 bg-slate-100 rounded-xl">📅</span>
          </div>
        </Link>

        <Link href="/users/admin/reviewAbsence" className="stat-card hover:-translate-y-0.5 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="stat-label">Pending Requests</p>
              <p className="stat-value">{quickStats.pendingAbsences}</p>
            </div>
            <span className="text-2xl p-2 bg-slate-100 rounded-xl">⚠️</span>
          </div>
        </Link>
      </section>

      {/* Responsive Operations Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* ROW 1 Left: Needs Attention */}
        <section className="lg:col-span-2 panel flex flex-col justify-between" style={{ minHeight: "360px" }}>
          <div>
            <div className="panel-header border-b border-slate-100 pb-3">
              <div>
                <h2 className="section-title text-slate-800" style={{ fontSize: "1.4rem" }}>Needs Attention</h2>
                <p className="section-copy">Operations requiring executive decisions today</p>
              </div>
              <span className="px-3 py-1 bg-rose-50 text-rose-700 text-xs font-bold rounded-full border border-rose-200 uppercase tracking-wider">
                Priority
              </span>
            </div>

            {visibleNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-center">
                <span className="text-4xl mb-3">✅</span>
                <h4 className="font-bold text-slate-800 text-base">All Caught Up!</h4>
                <p className="text-xs">No pending requests, unprocessed meetings, or failed actions.</p>
              </div>
            ) : (
              <div className="space-y-3 mt-4">
                {visibleNotifications.map((item) => (
                  <div key={item.id} className="group relative flex items-start gap-4 p-3.5 bg-white/70 hover:bg-white rounded-2xl border border-slate-100 hover:shadow-xs transition-all duration-200">
                    <div className="mt-1">
                      {item.type === "absence_requests" && <span className="text-lg">✉️</span>}
                      {item.type === "missing_checkin" && <span className="text-lg">🕒</span>}
                      {item.type === "strikes_unprocessed" && <span className="text-lg">⚡</span>}
                      {item.type === "two_strikes" && <span className="text-lg">🚨</span>}
                      {item.type === "email_failures" && <span className="text-lg">❌</span>}
                    </div>
                    <div className="flex-1">
                      {item.action === "process_strikes" ? (
                        <button
                          onClick={triggerStrikeProcessor}
                          disabled={isProcessingStrikes}
                          className="text-left block w-full focus:outline-hidden"
                        >
                          <h4 className="font-bold text-slate-800 text-sm hover:underline cursor-pointer">
                            {item.title}
                          </h4>
                          <p className="text-xs text-slate-500 mt-1">{isProcessingStrikes ? "Processing now..." : item.description}</p>
                        </button>
                      ) : (
                        <Link href={item.link || "#"}>
                          <h4 className="font-bold text-slate-800 text-sm hover:underline cursor-pointer">
                            {item.title}
                          </h4>
                          <p className="text-xs text-slate-500 mt-1">{item.description}</p>
                        </Link>
                      )}
                    </div>
                    <div className="shrink-0 self-center">
                      {item.id === "two_strikes" ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Link
                            href={item.link || "#"}
                            className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors text-center"
                            style={{ textDecoration: "none" }}
                          >
                            Review
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDismissNotification(`two_strikes_${item.title}`)}
                            className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors text-center cursor-pointer"
                          >
                            Resolve
                          </button>
                        </div>
                      ) : item.action === "process_strikes" ? (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button
                            onClick={triggerStrikeProcessor}
                            disabled={isProcessingStrikes}
                            className="text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-200 transition-colors"
                          >
                            {isProcessingStrikes ? "Running..." : "Process Now"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMarkStrikesResolved(item.eventId || "")}
                            disabled={isResolving === item.eventId}
                            className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors text-center cursor-pointer"
                          >
                            {isResolving === item.eventId ? "Resolving..." : "Mark Resolved"}
                          </button>
                        </div>
                      ) : (
                        <Link
                          href={item.link || "#"}
                          className="text-xs font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors"
                        >
                          Action
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="text-[11px] text-slate-400 font-semibold border-t border-slate-100/60 pt-3 mt-4">
            * Operational flags update dynamically when members submit excuses or check in.
          </div>
        </section>

        {/* ROW 1 Right: Upcoming Events */}
        <section className="lg:col-span-1 panel flex flex-col justify-between" style={{ minHeight: "360px" }}>
          <div>
            <div className="panel-header border-b border-slate-100 pb-3">
              <div>
                <h2 className="section-title text-slate-800" style={{ fontSize: "1.4rem" }}>Upcoming Events</h2>
                <p className="section-copy">Nearest scheduled programming</p>
              </div>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
                <span className="text-3xl mb-2">📅</span>
                <p className="text-xs">No upcoming events scheduled.</p>
                <Link href="/users/admin/createEvent" className="text-xs text-amber-600 font-bold hover:underline mt-2">
                  Create Event →
                </Link>
              </div>
            ) : (
              <div className="space-y-4 mt-4 overflow-y-auto pr-1.5" style={{ maxHeight: "250px" }}>
                {upcomingEvents.map((evt) => (
                  <div key={evt.id} className="p-3 bg-white/50 border border-slate-100 rounded-2xl flex flex-col gap-2 hover:shadow-xs transition-all">
                    <div className="flex justify-between items-start gap-1">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm leading-snug line-clamp-1">{evt.name}</h4>
                        <span className="text-[11px] text-slate-400 font-medium">
                          {new Date(evt.date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                          evt.is_mandatory
                            ? "bg-rose-50 text-rose-700 border border-rose-100"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {evt.is_mandatory ? "Mandatory" : "Optional"}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 border-t border-slate-100/50 pt-2">
                      <Link
                        href={`/users/admin/createEvent?eventId=${evt.id}`}
                        className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-2 py-1 rounded-md transition-colors"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/users/admin/eventReview?eventId=${evt.id}`}
                        className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-2 py-1 rounded-md transition-colors"
                      >
                        View Attendees
                      </Link>
                      
                      {evt.qr_code_secret ? (
                        <button
                          onClick={() => setActiveQrEvent({ id: evt.id, name: evt.name, secret: evt.qr_code_secret! })}
                          className="text-[10px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-md border border-amber-100 transition-colors"
                        >
                          Show QR
                        </button>
                      ) : (
                        <span className="text-[9px] text-slate-400 px-2 py-1">No QR</span>
                      )}


                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Link
            href="/users/admin/viewAllEvents"
            className="text-xs text-center font-bold text-slate-500 hover:text-slate-950 border-t border-slate-100 pt-3 mt-3 block"
          >
            Manage Events →
          </Link>
        </section>
      </div>

      {/* ROW 2: Quick Actions & Members at Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Quick Actions Panel */}
        <section className="lg:col-span-1 panel flex flex-col justify-between" style={{ minHeight: "360px" }}>
          <div>
            <div className="panel-header border-b border-slate-100 pb-3">
              <div>
                <h2 className="section-title text-slate-800" style={{ fontSize: "1.4rem" }}>Quick Actions</h2>
                <p className="section-copy">Most frequently executed admin commands</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-5">
              <Link
                href="/users/admin/createEvent"
                className="flex flex-col items-center justify-center p-4 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/50 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 text-center font-bold text-xs"
              >
                <span className="text-2xl mb-1.5">➕</span>
                Create Event
              </Link>

              <button
                onClick={() => setIsQrSelectorOpen(true)}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/50 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 text-center font-bold text-xs cursor-pointer"
              >
                <span className="text-2xl mb-1.5">🖼️</span>
                Generate QR
              </button>

              <Link
                href="/users/admin/bulkAdd"
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/50 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 text-center font-bold text-xs"
              >
                <span className="text-2xl mb-1.5">📥</span>
                New Members Bulk Add
              </Link>

              <Link
                href="/users/admin/reviewAbsence"
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/50 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 text-center font-bold text-xs"
              >
                <span className="text-2xl mb-1.5">⚠️</span>
                Review Absences
              </Link>

              <Link
                href="/users/admin/send-email"
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/50 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 text-center font-bold text-xs"
              >
                <span className="text-2xl mb-1.5">✉️</span>
                Email Members
              </Link>

              <button
                onClick={triggerStrikeProcessor}
                disabled={isProcessingStrikes}
                className="flex flex-col items-center justify-center p-4 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/50 rounded-2xl transition-all duration-200 hover:-translate-y-0.5 text-center font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                <span className="text-2xl mb-1.5">⚡</span>
                {isProcessingStrikes ? "Running..." : "Process Strikes"}
              </button>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-4">
            Actions execute immediately. Check results in logs.
          </div>
        </section>

        {/* Members at Risk Panel */}
        <section className="lg:col-span-2 panel flex flex-col justify-between" style={{ minHeight: "360px" }}>
          <div>
            <div className="panel-header border-b border-slate-100 pb-3">
              <div>
                <h2 className="section-title text-slate-800" style={{ fontSize: "1.4rem" }}>Members At Risk</h2>
                <p className="section-copy">Proactively review members nearing strike thresholds or missing points</p>
              </div>
            </div>

            {membersAtRisk.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 text-center">
                <span className="text-3xl mb-2">⭐</span>
                <p className="text-xs font-bold text-slate-700">All Members in Good Standing</p>
                <p className="text-[11px] mt-1 text-slate-400">Nobody has reached strike limit or fell behind attendance guidelines.</p>
              </div>
            ) : (
              <div className="overflow-y-auto mt-4 pr-1" style={{ maxHeight: "230px" }}>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 font-bold text-slate-400 uppercase tracking-wider pb-2">
                      <th className="pb-2">Member</th>
                      <th className="pb-2 text-center">Strikes</th>
                      <th className="pb-2 text-center">Points (Prof/Serv/Soc)</th>
                      <th className="pb-2 text-right">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {membersAtRisk.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 font-bold text-slate-800">
                          <Link href="/users/admin/reviewMemberStats" className="hover:underline">
                            {member.name}
                          </Link>
                        </td>
                        <td className="py-2.5 text-center font-bold">
                          <span className={`px-2 py-0.5 rounded-full ${
                            member.strikes >= 2 ? "bg-rose-100 text-rose-700 font-extrabold" : "bg-slate-100 text-slate-600"
                          }`}>
                            {member.strikes}
                          </span>
                        </td>
                        <td className="py-2.5 text-center text-slate-500 font-semibold">
                          P: <span className="text-slate-800">{member.professionalPoints}</span> | 
                          S: <span className="text-slate-800">{member.servicePoints}</span> | 
                          So: <span className="text-slate-800">{member.socialPoints}</span>
                        </td>
                        <td className="py-2.5 text-right font-bold text-rose-600">
                          {member.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <Link
            href="/users/admin/reviewMemberStats"
            className="text-xs text-center font-bold text-slate-500 hover:text-slate-950 border-t border-slate-100 pt-3 mt-3 block"
          >
            Review Detailed Member Stats →
          </Link>
        </section>
      </div>

      {/* ROW 3: Club Progress & Attendance Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Club Progress Panel */}
        <section className="lg:col-span-2 panel flex flex-col justify-between" style={{ minHeight: "300px" }}>
          <div>
            <div className="panel-header border-b border-slate-100 pb-3">
              <div>
                <h2 className="section-title text-slate-800" style={{ fontSize: "1.4rem" }}>Club Progress</h2>
                <p className="section-copy">Member completion count against category requirements</p>
              </div>
            </div>

            <div className="space-y-4 mt-6 overflow-y-auto pr-1.5" style={{ maxHeight: "200px" }}>
              {/* Professional */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                  <span>Professional Requirement</span>
                  <span>
                    {clubProgress.professionalCompleted} / {clubProgress.totalMembers} Members Finished (
                    {clubProgress.totalMembers > 0
                      ? Math.round((clubProgress.professionalCompleted / clubProgress.totalMembers) * 100)
                      : 0}
                    %)
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/50">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{
                      width: `${
                        clubProgress.totalMembers > 0
                          ? (clubProgress.professionalCompleted / clubProgress.totalMembers) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Social */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                  <span>Social Requirement</span>
                  <span>
                    {clubProgress.socialCompleted} / {clubProgress.totalMembers} Members Finished (
                    {clubProgress.totalMembers > 0
                      ? Math.round((clubProgress.socialCompleted / clubProgress.totalMembers) * 100)
                      : 0}
                    %)
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/50">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-500"
                    style={{
                      width: `${
                        clubProgress.totalMembers > 0
                          ? (clubProgress.socialCompleted / clubProgress.totalMembers) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Service */}
              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
                  <span>Service Requirement</span>
                  <span>
                    {clubProgress.serviceCompleted} / {clubProgress.totalMembers} Members Finished (
                    {clubProgress.totalMembers > 0
                      ? Math.round((clubProgress.serviceCompleted / clubProgress.totalMembers) * 100)
                      : 0}
                    %)
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/50">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-500"
                    style={{
                      width: `${
                        clubProgress.totalMembers > 0
                          ? (clubProgress.serviceCompleted / clubProgress.totalMembers) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-4">
            Reqs are loaded from the database point requirements table.
          </div>
        </section>

        {/* Attendance Panel */}
        <section className="lg:col-span-1 panel flex flex-col justify-between" style={{ minHeight: "360px" }}>
          <div>
            <div className="panel-header border-b border-slate-100 pb-3">
              <div>
                <h2 className="section-title text-slate-800" style={{ fontSize: "1.4rem" }}>Attendance</h2>
                <p className="section-copy">Participation and check-in rates</p>
              </div>
            </div>

            <div className="space-y-6 mt-6">
              <div>
                <p className="text-xs text-slate-400 font-semibold mb-1">LAST PAST EVENT</p>
                <div className="flex justify-between items-baseline">
                  <h4 className="font-extrabold text-slate-800 text-2xl">
                    {attendanceOverview.lastEventRate !== null ? `${attendanceOverview.lastEventRate}%` : "N/A"}
                  </h4>
                  <span className="text-xs font-medium text-slate-500 line-clamp-1 max-w-[160px] text-right">
                    {attendanceOverview.lastEventName || "No past events"}
                  </span>
                </div>
                <div className="w-full bg-slate-200/60 rounded-full h-2 mt-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all"
                    style={{ width: `${attendanceOverview.lastEventRate ?? 0}%` }}
                  />
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 font-semibold mb-1">AVERAGE THIS SEMESTER</p>
                <div className="flex justify-between items-baseline">
                  <h4 className="font-extrabold text-slate-800 text-2xl">
                    {attendanceOverview.averageRate !== null ? `${attendanceOverview.averageRate}%` : "N/A"}
                  </h4>
                  <span className="text-xs text-slate-500 font-medium">All members</span>
                </div>
                <div className="w-full bg-slate-200/60 rounded-full h-2 mt-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${attendanceOverview.averageRate ?? 0}%` }}
                  />
                </div>
              </div>

              <div className="p-3 bg-rose-50/60 border border-rose-100 rounded-2xl flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold text-rose-800 uppercase tracking-wide">Missed Mandatory Event</h5>
                  <p className="text-[11px] text-rose-600 mt-0.5">Members with active strikes</p>
                </div>
                <span className="text-xl font-extrabold text-rose-700 bg-rose-100 px-3 py-1 rounded-xl">
                  {attendanceOverview.missedMandatoryCount}
                </span>
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-4">
            Targets are based on full-term general membership parameters.
          </div>
        </section>
      </div>

      {/* ROW 4: Recent Activity & System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recent Activity Feed */}
        <section className="lg:col-span-2 panel flex flex-col justify-between" style={{ minHeight: "360px" }}>
          <div>
            <div className="panel-header border-b border-slate-100 pb-3">
              <div>
                <h2 className="section-title text-slate-800" style={{ fontSize: "1.4rem" }}>Recent Activity</h2>
                <p className="section-copy">Operational logs from check-ins and administrators</p>
              </div>
            </div>

            {recentActivity.length === 0 ? (
              <p className="text-slate-400 text-xs py-12 text-center">No recent activity logs available.</p>
            ) : (
              <div className="space-y-3.5 mt-4 overflow-y-auto pr-1.5" style={{ maxHeight: "250px" }}>
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex gap-3 text-xs items-start">
                    <span className="shrink-0 text-base mt-0.5">
                      {activity.type === "checkin" && "✅"}
                      {activity.type === "absence" && "✉️"}
                      {activity.type === "event_create" && "📅"}
                      {activity.type === "csv_import" && "📥"}
                      {activity.type === "strike" && "🚨"}
                    </span>
                    <div className="flex-1 bg-white/40 p-2.5 rounded-xl border border-slate-100/60">
                      <p className="text-slate-800 font-semibold">{activity.description}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400 font-semibold self-center">
                      {formatRelativeActivity(activity.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="text-[11px] text-slate-400 pt-3 border-t border-slate-100/50 mt-3">
            Realtime database sync active. Actions are logged instantly.
          </div>
        </section>

        {/* System Status Panel */}
        <section className="lg:col-span-1 panel flex flex-col justify-between" style={{ minHeight: "300px" }}>
          <div>
            <div className="panel-header border-b border-slate-100 pb-3">
              <div>
                <h2 className="section-title text-slate-800" style={{ fontSize: "1.4rem" }}>System Status</h2>
                <p className="section-copy">Monitoring external dependencies</p>
              </div>
            </div>

            <div className="space-y-3.5 mt-5">
              <div className="flex items-center justify-between p-2.5 bg-white/40 rounded-xl border border-slate-100/60 text-xs">
                <span className="font-semibold text-slate-700">Supabase DB</span>
                <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  systemHealth.supabaseStatus === "healthy"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}>
                  {systemHealth.supabaseStatus === "healthy" ? "Healthy" : "Offline"}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-white/40 rounded-xl border border-slate-100/60 text-xs">
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-700">GCal Sync</span>
                  <span className="text-[10px] text-slate-400 font-medium mt-0.5">{gcalSyncTimeStr}</span>
                </div>
                <button
                  onClick={triggerGcalSync}
                  disabled={isSyncingGcal}
                  className="px-2.5 py-1 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold rounded-lg transition-colors cursor-pointer"
                >
                  {isSyncingGcal ? "Syncing..." : "Sync Now"}
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-white/40 rounded-xl border border-slate-100/60 text-xs">
                <span className="font-semibold text-slate-700">Cron Jobs</span>
                <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  systemHealth.cronStatus === "running"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}>
                  {systemHealth.cronStatus === "running" ? "Active" : "Issues Found"}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-white/40 rounded-xl border border-slate-100/60 text-xs">
                <span className="font-semibold text-slate-700">GAS Email pipeline</span>
                <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  systemHealth.emailStatus === "healthy"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-rose-50 text-rose-700 border border-rose-200"
                }`}>
                  {systemHealth.emailStatus === "healthy" ? "Healthy" : "Degraded"}
                </span>
              </div>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 mt-4">
            Sync details pulled from external calendars.
          </div>
        </section>
      </div>

      {/* QR CODE MODAL */}
      {activeQrEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-filter backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-xl relative animate-in fade-in zoom-in duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">CHECK-IN PORTAL</span>
                <h3 className="font-bold text-slate-800 text-lg leading-snug">{activeQrEvent.name}</h3>
              </div>
              <button
                onClick={() => {
                  setActiveQrEvent(null);
                  setDownloadError(null);
                }}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* QR Content */}
            <div className="flex flex-col items-center justify-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <div ref={qrRef} className="p-3 bg-white rounded-xl border border-slate-200/60 shadow-xs">
                <QRCode
                  value={
                    typeof window !== "undefined"
                      ? `${window.location.origin}/check-in/${activeQrEvent.secret}`
                      : `/check-in/${activeQrEvent.secret}`
                  }
                  size={200}
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-4 text-center font-medium">
                Members check in by scanning this code with their phones.
              </p>
            </div>

            {downloadError && (
              <p className="text-xs text-rose-600 mt-2 text-center font-semibold">{downloadError}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2.5 mt-5">
              <button
                onClick={handleDownloadQrCode}
                className="flex-1 btn font-bold py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-xs transition-colors text-center text-xs cursor-pointer"
              >
                Download PNG
              </button>
              <button
                onClick={() => {
                  setActiveQrEvent(null);
                  setDownloadError(null);
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-250 text-slate-700 border border-slate-200 font-bold rounded-xl transition-colors text-center text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELECT EVENT FOR QR MODAL */}
      {isQrSelectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-filter backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-base">Select Event for QR Code</h3>
                <p className="text-xs text-slate-400 mt-0.5">Select from upcoming events with check-in keys</p>
              </div>
              <button onClick={() => setIsQrSelectorOpen(false)} className="text-slate-400 hover:text-slate-700 text-lg font-bold">✕</button>
            </div>

            <div className="space-y-2 mt-4 max-h-[260px] overflow-y-auto pr-1">
              {qrEvents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No scheduled events have check-in codes available.</p>
              ) : (
                qrEvents.map((evt) => (
                  <button
                    key={evt.id}
                    onClick={() => {
                      setActiveQrEvent({ id: evt.id, name: evt.name, secret: evt.qr_code_secret });
                      setIsQrSelectorOpen(false);
                    }}
                    className="w-full text-left p-3 bg-slate-50 hover:bg-slate-100 border border-slate-100 hover:border-slate-200 rounded-xl transition-all flex justify-between items-center text-xs font-semibold text-slate-800 cursor-pointer"
                  >
                    <div>
                      <p className="font-bold">{evt.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(evt.date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-amber-500 font-bold">Select →</span>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => setIsQrSelectorOpen(false)}
              className="w-full mt-4 py-2.5 bg-slate-100 hover:bg-slate-250 text-slate-700 border border-slate-200 font-bold rounded-xl transition-colors text-center text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
