"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "../../authprovider";
import RequireAuth from "../../RequireAuth";

type EventItem = {
  id: string;
  name: string;
  points: number | null;
  date: string;
  event_type: string;
  dresscode?: string;
  is_mandatory: boolean | null;
  location?: string | null;
  description?: string | null;
  end_date?: string | null;
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

export default function MemberEventDetailsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={
        <div className="app-shell">
          <div className="page-frame">
            <div className="panel" style={{ textAlign: "center", padding: "40px" }}>
              <p className="section-copy">Loading event details...</p>
            </div>
          </div>
        </div>
      }>
        <EventDetailsClient />
      </Suspense>
    </RequireAuth>
  );
}

function EventDetailsClient() {
  const { session } = useAuth();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId") || "";
  const router = useRouter();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [absence, setAbsence] = useState<AbsenceRecord | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [addingToCal, setAddingToCal] = useState(false);

  async function loadData() {
    if (!eventId || !session?.user?.id) return;
    setLoading(true);
    try {
      const [eventRes, attendanceRes, absenceRes] = await Promise.all([
        supabase.from("events").select("*").eq("id", eventId).single(),
        supabase.from("attendance").select("*").eq("event_id", eventId).eq("user_id", session.user.id).maybeSingle(),
        supabase.from("excused_absences").select("*").eq("event_id", eventId).eq("user_id", session.user.id).maybeSingle(),
      ]);

      if (eventRes.error) throw eventRes.error;
      setEvent(eventRes.data as EventItem);
      setAttendance(attendanceRes.data as AttendanceRecord | null);
      setAbsence(absenceRes.data as AbsenceRecord | null);
    } catch (err: any) {
      console.error("Error loading event:", err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, session]);

  const addEventToGoogleCalendar = async () => {
    if (!event) return;
    setAddingToCal(true);
    try {
      const res = await fetch('/api/gcal-personal/add-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });

      if (!res.ok) throw new Error('Failed to add event');
      alert('Event successfully added to your Google Calendar!');
    } catch (err) {
      alert('Could not add event to Google Calendar. Make sure you have connected Google Calendar under settings.');
    } finally {
      setAddingToCal(false);
    }
  };

  // Determine Attendance Status
  const statusInfo = useMemo(() => {
    if (attendance) {
      return {
        label: "Checked In",
        color: "var(--success)",
        background: "rgba(63,122,83,0.12)",
        detail: attendance.timestamp ? `Verified at ${formatTimeOnly(attendance.timestamp)}` : "Verified Present"
      };
    }
    
    if (absence) {
      if (absence.status?.toUpperCase() === "APPROVED") {
        return {
          label: "Excused Absence Approved",
          color: "var(--accent-strong)",
          background: "rgba(229,138,39,0.12)",
          detail: "Excuse request reviewed and approved by admins."
        };
      }
      if (absence.status?.toUpperCase() === "DENIED") {
        return {
          label: "Excuse Request Denied",
          color: "var(--danger)",
          background: "rgba(154,59,49,0.12)",
          detail: "Absence review was disapproved by admins."
        };
      }
      return {
        label: "Excuse Review Pending",
        color: "var(--accent)",
        background: "rgba(229,138,39,0.08)",
        detail: "Excuse request submitted and awaiting admin approval."
      };
    }

    return {
      label: "Not Checked In",
      color: "var(--danger)",
      background: "rgba(154,59,49,0.12)",
      detail: event?.is_mandatory ? "Attendance is required for this event." : "Optional event attendance."
    };
  }, [attendance, absence, event]);

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
            <Link href="/users/member" className="btn-secondary" style={{ marginTop: "12px" }}>
              ← Back to Schedule
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const categoryLabel = event.event_type.replaceAll("_", " ");
  const googleMapsUrl = event.location 
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
    : null;

  return (
    <div className="app-shell" style={{ padding: "24px 16px", minHeight: "100vh" }}>
      <div className="page-frame page-stack" style={{ maxWidth: "680px", margin: "0 auto", gap: "24px" }}>
        
        {/* Header Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/users/member" className="btn-secondary" style={{ fontSize: "0.85rem", padding: "6px 12px", borderRadius: "10px" }}>
            ← Back to Schedule
          </Link>
          <img src="/nobe_logo_f.svg" alt="NOBE" style={{ width: "36px", height: "36px" }} />
        </div>

        {/* Event Header Panel */}
        <section className="hero-card" style={{ background: "linear-gradient(135deg, var(--surface-strong) 0%, rgba(255,251,247,0.75) 100%)", borderRadius: "24px", padding: "24px" }}>
          <div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
              <span style={{ fontSize: "0.75rem", padding: "3px 8px", background: "var(--surface-alt)", color: "var(--foreground)", borderRadius: "6px", fontWeight: "600" }}>
                {categoryLabel}
              </span>
              {event.is_mandatory && (
                <span style={{ fontSize: "0.75rem", padding: "3px 8px", background: "rgba(154,59,49,0.12)", color: "var(--danger)", borderRadius: "6px", fontWeight: "700" }}>
                  Mandatory
                </span>
              )}
            </div>

            <h1 className="page-title" style={{ fontSize: "2rem", marginBottom: "12px", letterSpacing: "-0.02em", color: "#111" }}>{event.name}</h1>
            
            <p style={{ fontSize: "0.95rem", color: "var(--foreground)", margin: "0 0 6px 0", fontWeight: "600" }}>
              📅 {formatDate(event.date)}
            </p>
            {event.location && (
              <p style={{ fontSize: "0.9rem", color: "var(--muted)", margin: 0, fontWeight: "500" }}>
                📍 {event.location}
              </p>
            )}
          </div>

          {googleMapsUrl && (
            <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ textDecoration: "none", fontSize: "0.85rem", padding: "10px 20px", display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "12px", textAlign: "center" }}
              >
                🗺️ Directions
              </a>
            </div>
          )}
        </section>

        {/* Status Card and Points */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }} className="mobile-stack-columns-details">
          <style jsx global>{`
            @media (max-width: 520px) {
              .mobile-stack-columns-details {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
          
          {/* Status block */}
          <div style={{ padding: "18px", background: statusInfo.background, border: `1px solid ${statusInfo.color}20`, borderRadius: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>Your Attendance</span>
            {attendance ? (
              <strong style={{ fontSize: "1.3rem", color: statusInfo.color, fontWeight: "800" }}>
                ✓ Checked In
              </strong>
            ) : (
              <strong style={{ fontSize: "1.3rem", color: statusInfo.color, fontWeight: "800" }}>
                {statusInfo.label}
              </strong>
            )}
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: "500" }}>{statusInfo.detail}</span>
          </div>

          {/* Points block */}
          <div style={{ padding: "18px", background: "var(--surface-strong)", border: "1px solid var(--border)", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>Points</span>
            <strong style={{ fontSize: "1.3rem", fontWeight: "800", color: "var(--accent-strong)" }}>
              Worth {event.points ?? 0} {categoryLabel} Point{event.points === 1 ? "" : "s"}
            </strong>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: "500" }}>Category: {categoryLabel}</span>
          </div>
        </div>

        {/* Event description */}
        <section className="panel" style={{ padding: "24px", borderRadius: "24px", background: "var(--surface-strong)", border: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: "800", margin: "0 0 10px 0", color: "#111" }}>Description</h2>
          {event.description ? (
            <p style={{ margin: 0, color: "var(--foreground)", fontSize: "0.92rem", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>
              {event.description}
            </p>
          ) : (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9rem", fontStyle: "italic" }}>
              No description provided for this event.
            </p>
          )}

          {event.dresscode && (
            <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "6px", borderTop: "1px solid #f0f0f0", paddingTop: "12px" }}>
              <span style={{ fontSize: "0.88rem", fontWeight: "700", color: "#333" }}>Dress Code:</span>
              <span style={{ fontSize: "0.88rem", color: "var(--muted)", fontWeight: "500" }}>{event.dresscode}</span>
            </div>
          )}
        </section>

        {/* Excuse request section */}
        {event.is_mandatory && !attendance && (
          <section className="panel" style={{ border: "1px solid rgba(229,138,39,0.25)", background: "rgba(255,251,247,0.75)", padding: "24px", borderRadius: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: "800", margin: 0, color: "var(--accent-strong)" }}>Can't Attend?</h2>
            <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--foreground)", lineHeight: "1.5" }}>
              This is a mandatory event. If you have a schedule clash (exam, interview, or emergency), you must submit a formal excuse request.
            </p>
            <div style={{ marginTop: "12px" }}>
              {absence ? (
                <div style={{ fontSize: "0.88rem", color: "var(--muted)", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <span>Excuse request status:</span>
                  <span style={{ color: statusInfo.color, fontWeight: "700" }}>{statusInfo.label}</span>
                </div>
              ) : (
                <Link
                  href={`/users/member/absence?eventId=${event.id}`}
                  className="btn"
                  style={{ display: "inline-block", fontSize: "0.85rem", padding: "10px 20px", background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)", color: "white", textDecoration: "none", borderRadius: "10px", fontWeight: "700", boxShadow: "0 4px 12px rgba(229,138,39,0.15)" }}
                >
                  Request Excused Absence
                </Link>
              )}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
