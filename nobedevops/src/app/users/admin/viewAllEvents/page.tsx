"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import QRCode from "react-qr-code";
import AdminGuard from "../AdminGuard";

type EventItem = {
  id: string;
  name: string;
  points: number | null;
  date: string;
  qr_code_secret: string | null;
  event_type: string;
  dresscode?: string;
  is_mandatory: boolean | null;
  created_at: string;
  location?: string | null;
  description?: string | null;
  end_date?: string | null;
  gcal_event_id?: string | null;
  check_in_starts_at?: string | null;
  check_in_ends_at?: string | null;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

function isGcalEvent(event: EventItem) {
  return !!event.gcal_event_id && !event.qr_code_secret;
}

export default function ViewAllEvents() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [gcalLoading, setGcalLoading] = useState(true);
  const [gcalError, setGcalError] = useState("");
  const [gcalSuccess, setGcalSuccess] = useState("");
  const [publicCalendarUrl, setPublicCalendarUrl] = useState("");
  const [currentPublicCalendar, setCurrentPublicCalendar] = useState("");
  const [publicGcalLoading, setPublicGcalLoading] = useState(false);
  const [unsyncLoading, setUnsyncLoading] = useState(false);
  
  // Advanced Filters
  const [statusFilter, setStatusFilter] = useState<"ALL" | "UPCOMING" | "PAST">("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [mandatoryFilter, setMandatoryFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"DATE_ASC" | "DATE_DESC" | "NAME_ASC" | "POINTS_DESC">("DATE_ASC");
  
  // Collapsible settings
  const [showGcalSettings, setShowGcalSettings] = useState(false);
  
  // QR Code Modal State
  const [activeQrEvent, setActiveQrEvent] = useState<{ id: string; name: string; secret: string; endsAt?: string | null } | null>(null);
  const [regeneratingQr, setRegeneratingQr] = useState(false);

  const [mounted, setMounted] = useState(false);
  const [viewMode, setViewMode] = useState<"LIST" | "CALENDAR">("LIST");
  const [displayMonth, setDisplayMonth] = useState(new Date());
  
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();


  const calendarDays = useMemo(() => {
    const monthStart = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
    const firstDayOfCalendar = new Date(monthStart);
    firstDayOfCalendar.setDate(monthStart.getDate() - monthStart.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(firstDayOfCalendar);
      date.setDate(firstDayOfCalendar.getDate() + index);
      return date;
    });
  }, [displayMonth]);

  function changeMonth(offset: number) {
    setDisplayMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [eventsRes, attendanceRes, peopleRes] = await Promise.all([
        supabase.from("events").select("*").order("date", { ascending: true }),
        supabase.from("attendance").select("user_id, event_id"),
        supabase.from("People").select("id, auth_id")
      ]);

      if (eventsRes.error) throw eventsRes.error;
      setEvents((eventsRes.data as EventItem[]) || []);
      setAttendance(attendanceRes.data || []);
      setPeople(peopleRes.data || []);
    } catch (err: any) {
      console.error("Error loading events data:", err.message);
    } finally {
      setLoading(false);
    }
  }

  async function syncAndRefetch() {
    setGcalLoading(true);
    setGcalError("");
    setGcalSuccess("");
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("nobe_public_calendar_link") : null;
      const activeLink = currentPublicCalendar || stored || "";
      const body = activeLink ? { calendarId: activeLink } : {};

      const res = await fetch("/api/gcal-club/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) {
        setGcalError(
          json.error.includes("Not Found")
            ? "Calendar not found or not public. Verify the link/ID and that the calendar is shared publicly."
            : json.error
        );
      } else {
        await fetchData();
      }
    } catch {
      setGcalError("Failed to sync Google Calendar events.");
    }
    setGcalLoading(false);
  }

  async function syncPublicCalendar(customUrl?: string) {
    const urlToSync = typeof customUrl === "string" ? customUrl : publicCalendarUrl;
    if (!urlToSync.trim()) {
      setGcalError("Enter a public Google Calendar link or ID.");
      return;
    }

    setPublicGcalLoading(true);
    setGcalError("");
    setGcalSuccess("");

    try {
      const res = await fetch("/api/gcal-club/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: urlToSync.trim() }),
      });
      const json = await res.json();

      if (json.error) {
        const errMsg = json.error.includes("Not Found")
          ? "Calendar not found or not public. Verify the link/ID and that the calendar is shared publicly."
          : json.error;
        setGcalError(errMsg);
        alert(errMsg);
      } else {
        const importedLink = urlToSync.trim();
        setGcalSuccess("Public Google Calendar imported successfully.");
        setCurrentPublicCalendar(importedLink);
        if (typeof window !== "undefined") {
          localStorage.setItem("nobe_public_calendar_link", importedLink);
        }
        setPublicCalendarUrl("");
        await fetchData();
      }
    } catch {
      const errMsg = "Failed to sync public Google Calendar.";
      setGcalError(errMsg);
      alert(errMsg);
    }

    setPublicGcalLoading(false);
  }

  async function unsyncCalendar(calendarId?: string) {
    setUnsyncLoading(true);
    setGcalError("");
    setGcalSuccess("");

    try {
      const res = await fetch("/api/gcal-club/unsync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId }),
      });
      const json = await res.json();

      if (json.error) {
        setGcalError(json.error);
      } else {
        if (calendarId) {
          setGcalSuccess("Custom Google Calendar link deleted and its events removed from Supabase.");
          setCurrentPublicCalendar("");
          if (typeof window !== "undefined") {
            localStorage.removeItem("nobe_public_calendar_link");
          }
        } else {
          setGcalSuccess("Imported Google Calendar events have been unsynced.");
        }
        await fetchData();
      }
    } catch {
      setGcalError(calendarId ? "Failed to delete calendar link and events." : "Failed to unsync imported Google Calendar events.");
    }

    setUnsyncLoading(false);
  }

  async function replacePublicCalendar() {
    const oldUrl = currentPublicCalendar;
    const newUrl = publicCalendarUrl.trim();
    if (!newUrl) {
      setGcalError("Enter a public Google Calendar link or ID.");
      return;
    }

    setPublicGcalLoading(true);
    setGcalError("");
    setGcalSuccess("");

    try {
      if (oldUrl) {
        const unsyncRes = await fetch("/api/gcal-club/unsync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ calendarId: oldUrl }),
        });
        const unsyncJson = await unsyncRes.json();
        if (unsyncJson.error) {
          throw new Error(`Failed to remove old calendar events: ${unsyncJson.error}`);
        }
      }

      const syncRes = await fetch("/api/gcal-club/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: newUrl }),
      });
      const syncJson = await syncRes.json();
      if (syncJson.error) {
        throw new Error(syncJson.error.includes("Not Found")
          ? "Calendar not found or not public. Verify the link/ID and that the calendar is shared publicly."
          : syncJson.error
        );
      }

      setGcalSuccess("Google Calendar successfully replaced and synchronized.");
      setCurrentPublicCalendar(newUrl);
      if (typeof window !== "undefined") {
        localStorage.setItem("nobe_public_calendar_link", newUrl);
      }
      setPublicCalendarUrl("");
      await fetchData();
    } catch (err: any) {
      const errMsg = err.message || "Failed to replace Google Calendar.";
      setGcalError(errMsg);
      alert(errMsg);
    }

    setPublicGcalLoading(false);
  }

  useEffect(() => {
    const init = async () => {
      await Promise.resolve();
      fetchData();
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("nobe_public_calendar_link");
        if (stored) {
          setCurrentPublicCalendar(stored);
        }
      }
      syncAndRefetch();
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quick action: Generate / View QR Code from Card
  async function handleQrAction(event: EventItem) {
    if (event.qr_code_secret) {
      setActiveQrEvent({
        id: event.id,
        name: event.name,
        secret: event.qr_code_secret,
        endsAt: event.check_in_ends_at
      });
    } else {
      setRegeneratingQr(true);
      try {
        const res = await fetch("/api/admin/generate-secret/check-in");
        if (!res.ok) throw new Error("Failed to generate code");
        const { secret } = await res.json();
        
        // Update Supabase
        const endsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // Default 30 mins
        const { error } = await supabase
          .from("events")
          .update({
            qr_code_secret: secret,
            check_in_starts_at: new Date().toISOString(),
            check_in_ends_at: endsAt
          })
          .eq("id", event.id);

        if (error) throw error;

        setEvents(prev => prev.map(e => e.id === event.id ? { ...e, qr_code_secret: secret, check_in_ends_at: endsAt } : e));
        setActiveQrEvent({
          id: event.id,
          name: event.name,
          secret,
          endsAt
        });
      } catch (err: any) {
        alert("Error generating QR code: " + err.message);
      } finally {
        setRegeneratingQr(false);
      }
    }
  }

  async function handleRegenerateQr() {
    if (!activeQrEvent) return;
    setRegeneratingQr(true);
    try {
      const res = await fetch("/api/admin/generate-secret/check-in");
      if (!res.ok) throw new Error("Failed to generate code");
      const { secret } = await res.json();
      
      const endsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("events")
        .update({
          qr_code_secret: secret,
          check_in_starts_at: new Date().toISOString(),
          check_in_ends_at: endsAt
        })
        .eq("id", activeQrEvent.id);

      if (error) throw error;

      setEvents(prev => prev.map(e => e.id === activeQrEvent.id ? { ...e, qr_code_secret: secret, check_in_ends_at: endsAt } : e));
      setActiveQrEvent({
        id: activeQrEvent.id,
        name: activeQrEvent.name,
        secret,
        endsAt
      });
    } catch (err: any) {
      alert("Error regenerating QR code: " + err.message);
    } finally {
      setRegeneratingQr(false);
    }
  }

  // Filter & Sort calculation
  const processedEvents = useMemo(() => {
    const now = new Date();
    
    let filtered = events.filter((event) => {
      // Exclude pure GCal sync duplicates
      if (isGcalEvent(event)) return false;

      // Search Query
      const matchesSearch = event.name.toLowerCase().includes(search.toLowerCase().trim());
      if (!matchesSearch) return false;

      // Status Filter
      const eventDate = new Date(event.date);
      if (statusFilter === "UPCOMING" && eventDate < now) return false;
      if (statusFilter === "PAST" && eventDate >= now) return false;

      // Type Filter
      if (typeFilter !== "ALL" && event.event_type !== typeFilter) return false;

      // Mandatory Filter
      if (mandatoryFilter === "MANDATORY" && event.is_mandatory !== true) return false;
      if (mandatoryFilter === "OPTIONAL" && event.is_mandatory === true) return false;

      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === "DATE_ASC") {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      } else if (sortBy === "DATE_DESC") {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      } else if (sortBy === "NAME_ASC") {
        return a.name.localeCompare(b.name);
      } else if (sortBy === "POINTS_DESC") {
        return (b.points || 0) - (a.points || 0);
      }
      return 0;
    });

    return filtered;
  }, [events, search, statusFilter, typeFilter, mandatoryFilter, sortBy]);

  const eventsByDate = useMemo(() => {
    return processedEvents.reduce<Record<string, EventItem[]>>((acc, event) => {
      const eventDate = new Date(event.date);
      const key = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});
  }, [processedEvents]);

  // Statistics helpers for cards
  const statsMap = useMemo(() => {
    const map: Record<string, { attended: number; total: number }> = {};
    events.forEach(evt => {
      const attended = attendance.filter(a => a.event_id === evt.id).length;
      map[evt.id] = { attended, total: people.length };
    });
    return map;
  }, [events, attendance, people]);

  function formatDateRange(startDateStr: string, endDateStr?: string | null) {
    const start = new Date(startDateStr);
    if (Number.isNaN(start.getTime())) return startDateStr;
    const dateFormatted = start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const timeStart = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (endDateStr) {
      const end = new Date(endDateStr);
      if (!Number.isNaN(end.getTime())) {
        const timeEnd = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return `${dateFormatted} • ${timeStart}–${timeEnd}`;
      }
    }
    return `${dateFormatted} • ${timeStart}`;
  }

  function getEventIcon(type: string) {
    switch (type) {
      case "PROFESSIONAL": return "💼";
      case "SOCIAL": return "🤝";
      case "SERVICE":
      case "SERVICE_PHILANTHROPY": return "🌱";
      case "GENERAL_MEETING": return "📢";
      case "NEW_MEMBER_WORKSHOP": return "🎓";
      default: return "📅";
    }
  }

  // QR time remaining indicator
  const timeRemainingStr = useMemo(() => {
    if (!activeQrEvent || !activeQrEvent.endsAt) return null;
    const diff = new Date(activeQrEvent.endsAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.ceil(diff / 60000);
    return `${mins} minutes`;
  }, [activeQrEvent]);

  return (
    <AdminGuard>
      <div className="app-shell" style={{ padding: "24px 16px", minHeight: "100vh" }}>
        <div className="page-frame page-stack" style={{ maxWidth: "1000px", margin: "0 auto", gap: "24px" }}>
          
          {/* Top Bar Navigation */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Link href="/users/admin" style={{ fontSize: "0.85rem", color: "var(--muted)", textDecoration: "none", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              ← Admin Dashboard
            </Link>
            <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>NOBE Chapter Management</span>
          </div>

          {/* Header Section */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
            <h1 style={{ fontSize: "2.2rem", fontWeight: "800", letterSpacing: "-0.03em", margin: 0, color: "#1a1a1a" }}>Events</h1>
            <Link href="/users/admin/createEvent" className="btn" style={{ background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)", border: "none", color: "white", padding: "12px 24px", borderRadius: "14px", fontWeight: "700", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px", boxShadow: "0 4px 12px rgba(229,138,39,0.2)" }}>
              + Create Event
            </Link>
          </div>

          {/* Search, Filter, Sort Controls */}
          <div className="panel" style={{ padding: "20px", borderRadius: "20px", display: "flex", flexDirection: "column", gap: "16px", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "240px" }}>
                <input
                  type="text"
                  placeholder="Search events..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="field-input"
                  style={{ width: "100%", borderRadius: "12px", height: "44px", padding: "0 16px", border: "1px solid var(--border)", fontSize: "0.92rem", background: "#fcfcfc" }}
                />
              </div>
              
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="field-select"
                  style={{ borderRadius: "12px", height: "44px", border: "1px solid var(--border)", padding: "0 12px", background: "white", fontSize: "0.88rem", minWidth: "120px", cursor: "pointer" }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="UPCOMING">Upcoming</option>
                  <option value="PAST">Past</option>
                </select>

                {/* Category Filter */}
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="field-select"
                  style={{ borderRadius: "12px", height: "44px", border: "1px solid var(--border)", padding: "0 12px", background: "white", fontSize: "0.88rem", minWidth: "130px", cursor: "pointer" }}
                >
                  <option value="ALL">All Categories</option>
                  <option value="PROFESSIONAL">Professional</option>
                  <option value="SOCIAL">Social</option>
                  <option value="SERVICE">Service</option>
                  <option value="GENERAL_MEETING">General Meeting</option>
                  <option value="NEW_MEMBER_WORKSHOP">New Member Workshop</option>
                  <option value="PROJECT_MEETING">Project Meeting</option>
                  <option value="OTHER_MANDATORY">Other Mandatory</option>
                </select>

                {/* Mandatory Filter */}
                <select
                  value={mandatoryFilter}
                  onChange={(e) => setMandatoryFilter(e.target.value)}
                  className="field-select"
                  style={{ borderRadius: "12px", height: "44px", border: "1px solid var(--border)", padding: "0 12px", background: "white", fontSize: "0.88rem", minWidth: "120px", cursor: "pointer" }}
                >
                  <option value="ALL">All Attendance</option>
                  <option value="MANDATORY">Mandatory</option>
                  <option value="OPTIONAL">Optional</option>
                </select>

                {/* Sorting */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="field-select"
                  style={{ borderRadius: "12px", height: "44px", border: "1px solid var(--border)", padding: "0 12px", background: "white", fontSize: "0.88rem", minWidth: "130px", cursor: "pointer" }}
                >
                  <option value="DATE_ASC">Date: Soonest First</option>
                  <option value="DATE_DESC">Date: Latest First</option>
                  <option value="NAME_ASC">Name: A-Z</option>
                  <option value="POINTS_DESC">Points: High to Low</option>
                </select>
              </div>
            </div>

            {/* Quick Filter Badges */}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.03em" }}>Quick Filters:</span>
              <button
                type="button"
                onClick={() => { setStatusFilter("UPCOMING"); setTypeFilter("ALL"); setMandatoryFilter("ALL"); }}
                className="btn-secondary"
                style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "30px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "4px", background: statusFilter === "UPCOMING" ? "rgba(63,122,83,0.08)" : "transparent", borderColor: statusFilter === "UPCOMING" ? "var(--success)" : "var(--border)" }}
              >
                🟢 Upcoming
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter("ALL"); setTypeFilter("ALL"); setMandatoryFilter("MANDATORY"); }}
                className="btn-secondary"
                style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "30px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "4px", background: mandatoryFilter === "MANDATORY" ? "rgba(154,59,49,0.08)" : "transparent", borderColor: mandatoryFilter === "MANDATORY" ? "var(--danger)" : "var(--border)" }}
              >
                🔴 Mandatory
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter("ALL"); setTypeFilter("SOCIAL"); setMandatoryFilter("ALL"); }}
                className="btn-secondary"
                style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "30px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "4px", background: typeFilter === "SOCIAL" ? "rgba(79,80,82,0.05)" : "transparent", borderColor: typeFilter === "SOCIAL" ? "var(--muted)" : "var(--border)" }}
              >
                🤝 Social
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter("ALL"); setTypeFilter("PROFESSIONAL"); setMandatoryFilter("ALL"); }}
                className="btn-secondary"
                style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "30px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "4px", background: typeFilter === "PROFESSIONAL" ? "rgba(79,80,82,0.05)" : "transparent", borderColor: typeFilter === "PROFESSIONAL" ? "var(--muted)" : "var(--border)" }}
              >
                💼 Professional
              </button>
              <button
                type="button"
                onClick={() => { setStatusFilter("ALL"); setTypeFilter("SERVICE"); setMandatoryFilter("ALL"); }}
                className="btn-secondary"
                style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "30px", borderRadius: "20px", display: "inline-flex", alignItems: "center", gap: "4px", background: typeFilter === "SERVICE" ? "rgba(79,80,82,0.05)" : "transparent", borderColor: typeFilter === "SERVICE" ? "var(--muted)" : "var(--border)" }}
              >
                🌱 Service
              </button>
              {(statusFilter !== "ALL" || typeFilter !== "ALL" || mandatoryFilter !== "ALL" || search) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("ALL");
                    setTypeFilter("ALL");
                    setMandatoryFilter("ALL");
                  }}
                  style={{ fontSize: "0.78rem", padding: "6px 12px", minHeight: "30px", borderRadius: "20px", color: "var(--danger)", border: "1px dashed var(--danger)", background: "transparent", cursor: "pointer", fontWeight: "600" }}
                >
                  Clear All Filters
                </button>
              )}
            </div>
          </div>

          {/* View Mode Toggle */}
          <div style={{ display: "flex", gap: "6px", background: "var(--surface-alt)", padding: "4px", borderRadius: "12px", maxWidth: "280px", margin: "0 0 4px 0" }}>
            <button
              type="button"
              onClick={() => setViewMode("LIST")}
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: "0.85rem",
                fontWeight: "700",
                borderRadius: "8px",
                border: "none",
                background: viewMode === "LIST" ? "white" : "transparent",
                boxShadow: viewMode === "LIST" ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
                cursor: "pointer",
                color: "var(--foreground)"
              }}
            >
              📋 Cards List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("CALENDAR")}
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: "0.85rem",
                fontWeight: "700",
                borderRadius: "8px",
                border: "none",
                background: viewMode === "CALENDAR" ? "white" : "transparent",
                boxShadow: viewMode === "CALENDAR" ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
                cursor: "pointer",
                color: "var(--foreground)"
              }}
            >
              📅 Calendar
            </button>
          </div>

          {viewMode === "LIST" ? (
            /* Event Cards Grid */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
              {loading ? (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px" }} className="panel">
                  <p style={{ margin: 0, color: "var(--muted)", fontWeight: "500" }}>Loading chapter events...</p>
                </div>
              ) : processedEvents.length === 0 ? (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px" }} className="panel">
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "1.05rem", fontWeight: "500" }}>No events found matching your search and filter settings.</p>
                </div>
              ) : (
                processedEvents.map((event) => {
                  const eventDate = new Date(event.date);
                  const isUpcoming = eventDate >= new Date();
                  const stats = statsMap[event.id] || { attended: 0, total: 0 };
                  
                  return (
                    <div
                      key={event.id}
                      className="subtle-card"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        padding: "24px",
                        borderRadius: "20px",
                        border: "1px solid var(--border)",
                        background: "var(--surface-strong)",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.02)",
                        transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        position: "relative"
                      }}
                    >
                      {/* Status Indicators Row */}
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
                        {isUpcoming ? (
                          <span style={{ fontSize: "0.72rem", padding: "4px 10px", borderRadius: "20px", background: "rgba(63,122,83,0.1)", color: "var(--success)", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            🟢 Upcoming
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.72rem", padding: "4px 10px", borderRadius: "20px", background: "rgba(107,108,112,0.08)", color: "var(--muted)", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            ⚪ Completed
                          </span>
                        )}

                        {event.is_mandatory && (
                          <span style={{ fontSize: "0.72rem", padding: "4px 10px", borderRadius: "20px", background: "rgba(154,59,49,0.08)", color: "var(--danger)", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            🔴 Mandatory
                          </span>
                        )}

                        {!event.qr_code_secret && (
                          <span style={{ fontSize: "0.72rem", padding: "4px 10px", borderRadius: "20px", background: "rgba(229,138,39,0.08)", color: "var(--accent-strong)", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            🟡 Draft
                          </span>
                        )}
                      </div>

                      {/* Card Content */}
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                        <h3 style={{ fontSize: "1.2rem", fontWeight: "800", margin: "0 0 4px 0", color: "#111", display: "flex", alignItems: "flex-start", gap: "6px", lineHeight: "1.3" }}>
                          <span>{getEventIcon(event.event_type)}</span>
                          <span>{event.name}</span>
                        </h3>
                        
                        <p style={{ fontSize: "0.88rem", color: "var(--muted)", margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: "4px" }}>
                          📅 {formatDateRange(event.date, event.end_date)}
                        </p>

                        <div style={{ fontSize: "0.85rem", color: "var(--foreground)", fontWeight: "500", display: "flex", alignItems: "center", gap: "6px", margin: "4px 0 8px" }}>
                          <span>{event.event_type.replaceAll("_", " ")}</span>
                          {event.is_mandatory !== null && (
                            <>
                              <span style={{ color: "var(--border-strong)" }}>•</span>
                              <span>{event.is_mandatory ? "Mandatory" : "Optional"}</span>
                            </>
                          )}
                          {event.points !== null && (
                            <>
                              <span style={{ color: "var(--border-strong)" }}>•</span>
                              <span>{event.points} pt{event.points === 1 ? "" : "s"}</span>
                            </>
                          )}
                        </div>

                        {event.location && (
                          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 12px 0", display: "flex", alignItems: "center", gap: "4px" }}>
                            📍 <span>{event.location}</span>
                          </p>
                        )}

                        {event.description && (
                          <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: "0 0 12px 0", fontStyle: "italic", whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: "1.4" }}>
                            📝 {event.description}
                          </p>
                        )}
                      </div>

                      {/* Attendance stats */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 0 0", padding: "8px 0", borderTop: "1px dashed var(--border)" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "var(--muted)" }}>
                          {event.is_mandatory ? (
                            <span>📊 {stats.attended} / {stats.total} Checked In</span>
                          ) : (
                            <span>👥 {stats.attended} Attendee{stats.attended === 1 ? "" : "s"}</span>
                          )}
                        </span>
                      </div>

                      {/* Card Actions Divider */}
                      <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "16px 0 12px 0" }} />

                      {/* Card Actions Row */}
                      <div style={{ display: "flex", gap: "12px", justifyContent: "space-between", alignItems: "center" }}>
                        <Link
                          href={`/users/admin/eventReview?eventId=${event.id}`}
                          style={{ fontSize: "0.82rem", fontWeight: "700", color: "var(--accent-strong)", textDecoration: "none", cursor: "pointer" }}
                        >
                          View Details
                        </Link>
                        
                        <Link
                          href={`/users/admin/createEvent?eventId=${event.id}`}
                          style={{ fontSize: "0.82rem", fontWeight: "700", color: "var(--foreground)", textDecoration: "none", cursor: "pointer" }}
                        >
                          Edit
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleQrAction(event)}
                          style={{ fontSize: "0.82rem", fontWeight: "700", color: "var(--success)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          Generate QR
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* Calendar View */
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "20px", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: "800", color: "#111" }}>
                  {displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </h3>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button type="button" onClick={() => changeMonth(-1)} className="btn-secondary" style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "32px", borderRadius: "10px", cursor: "pointer" }}>
                    Previous
                  </button>
                  <button type="button" onClick={() => setDisplayMonth(new Date())} className="btn-secondary" style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "32px", borderRadius: "10px", cursor: "pointer" }}>
                    Today
                  </button>
                  <button type="button" onClick={() => changeMonth(1)} className="btn-secondary" style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "32px", borderRadius: "10px", cursor: "pointer" }}>
                    Next
                  </button>
                </div>
              </div>

              <div className="calendar-compact">
                <div className="calendar-header">
                  {weekDays.map((day) => (
                    <div key={day} className="calendar-header-cell">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="calendar-grid">
                  {calendarDays.map((date) => {
                    const inMonth = date.getMonth() === displayMonth.getMonth();
                    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                    const dayEvents = eventsByDate[dateKey] || [];
                    const isToday = mounted && isSameDay(date, today);

                    return (
                      <div
                        key={date.toISOString()}
                        className={[
                          'calendar-day',
                          !inMonth ? 'calendar-day-muted' : '',
                          isToday ? 'calendar-day-today' : '',
                        ].join(' ').trim()}
                      >
                        <div className="calendar-day-head">
                          <div className="calendar-day-meta">
                            <strong className="calendar-day-number">{date.getDate()}</strong>
                            <span className="calendar-day-label">
                              {date.toLocaleDateString('en-US', { weekday: 'short' })}
                            </span>
                          </div>
                          {isToday && <span className="today-pill">Today</span>}
                        </div>

                        <div className="calendar-events">
                          {dayEvents.length === 0 ? (
                            <p className="calendar-empty-copy">{inMonth ? 'Open day' : ''}</p>
                          ) : (
                            dayEvents.slice(0, 3).map((evt) => {
                              return (
                                <Link
                                  key={evt.id}
                                  href={`/users/admin/eventReview?eventId=${evt.id}`}
                                  className="calendar-event"
                                  title={`View details for ${evt.name}`}
                                  style={{
                                    display: 'block',
                                    textDecoration: 'none',
                                    borderLeftColor: evt.is_mandatory ? 'var(--danger)' : 'var(--accent)',
                                    borderLeftWidth: '4px',
                                    paddingLeft: '8px',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <div className="calendar-event-topline">
                                    <div className="calendar-event-time">
                                      {new Date(evt.date).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </div>
                                    {evt.is_mandatory && (
                                      <span className="calendar-event-chip" style={{ backgroundColor: 'var(--danger)', color: 'white', fontSize: '8px', padding: '1px 6px' }}>
                                        Mandatory
                                      </span>
                                    )}
                                  </div>
                                  <div className="calendar-event-name" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#333' }}>
                                    <span>{getEventIcon(evt.event_type)}</span>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{evt.name}</span>
                                  </div>
                                </Link>
                              );
                            })
                          )}
                          {dayEvents.length > 3 && (
                            <div className="calendar-more-events">+{dayEvents.length - 3} more events</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Calendar Sync Collapsible Section */}
          <section className="panel" style={{ marginTop: "16px", padding: "16px 20px", borderRadius: "20px", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: "700", color: "#111" }}>Google Calendar Integration</h3>
                <p style={{ margin: "2px 0 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>Sync calendar items directly into Supabase database.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowGcalSettings(prev => !prev)}
                className="btn-secondary"
                style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "32px", borderRadius: "10px" }}
              >
                {showGcalSettings ? "Hide Settings" : "Configure Sync"}
              </button>
            </div>

            {showGcalSettings && (
              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <input
                    type="text"
                    placeholder="Public Google Calendar link or ID"
                    value={publicCalendarUrl}
                    onChange={(e) => setPublicCalendarUrl(e.target.value)}
                    className="field-input"
                    style={{ padding: "8px 12px", borderRadius: "10px", width: "100%", border: "1px solid var(--border)" }}
                  />
                  {currentPublicCalendar && (
                    <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: "var(--muted)", fontWeight: "bold" }}>
                      Active calendar ID: {currentPublicCalendar}
                    </p>
                  )}
                </div>

                <div className="action-row" style={{ gap: "8px", flexWrap: "wrap" }}>
                  {currentPublicCalendar && publicCalendarUrl.trim() ? (
                    <>
                      <button
                        type="button"
                        onClick={replacePublicCalendar}
                        className="btn"
                        style={{ background: "#2e7d32", color: "#fff", fontSize: "0.8rem", minHeight: "36px", padding: "0 12px", borderRadius: "8px" }}
                        disabled={publicGcalLoading || unsyncLoading}
                      >
                        {publicGcalLoading ? 'Replacing...' : 'Replace & Sync Calendar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPublicCalendarUrl("");
                          setGcalError("");
                          setGcalSuccess("");
                        }}
                        className="btn-secondary"
                        style={{ fontSize: "0.8rem", minHeight: "36px", padding: "0 12px", borderRadius: "8px" }}
                        disabled={publicGcalLoading || unsyncLoading}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => syncPublicCalendar()}
                        className="btn"
                        style={{ fontSize: "0.8rem", minHeight: "36px", padding: "0 12px", borderRadius: "8px" }}
                        disabled={!publicCalendarUrl.trim() || publicGcalLoading || unsyncLoading}
                      >
                        {publicGcalLoading ? 'Importing...' : 'Import Public Calendar'}
                      </button>
                      {currentPublicCalendar ? (
                        <button
                           type="button"
                           onClick={() => unsyncCalendar(currentPublicCalendar)}
                           className="btn-secondary"
                           style={{ borderColor: "var(--danger)", color: "var(--danger)", fontSize: "0.8rem", minHeight: "36px", padding: "0 12px", borderRadius: "8px" }}
                           disabled={unsyncLoading || publicGcalLoading}
                        >
                          {unsyncLoading ? 'Deleting...' : 'Delete Link & Remove Events'}
                        </button>
                      ) : null}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => unsyncCalendar()}
                    className="btn-secondary"
                    style={{ borderColor: "var(--danger)", color: "var(--danger)", fontSize: "0.8rem", minHeight: "36px", padding: "0 12px", marginLeft: "auto", borderRadius: "8px" }}
                    disabled={unsyncLoading || gcalLoading || publicGcalLoading}
                  >
                    {unsyncLoading ? 'Unsyncing...' : 'Unsync All Events'}
                  </button>
                </div>

                {gcalError && <div className="message-error" style={{ fontSize: "0.82rem" }}>Google Calendar sync failed: {gcalError}</div>}
                {gcalSuccess && <div className="message-success" style={{ fontSize: "0.82rem" }}>{gcalSuccess}</div>}
              </div>
            )}
          </section>

          {/* QR Code Modal Dialog */}
          {activeQrEvent && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 999,
                padding: "20px",
                backdropFilter: "blur(4px)"
              }}
              onClick={() => setActiveQrEvent(null)}
            >
              <div
                className="panel"
                style={{
                  width: "100%",
                  maxWidth: "400px",
                  background: "var(--surface-strong)",
                  padding: "24px",
                  borderRadius: "24px",
                  textAlign: "center",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
                  border: "1px solid var(--border)"
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <p className="eyebrow" style={{ margin: 0 }}>Check-In QR Code</p>
                  <button
                    type="button"
                    onClick={() => setActiveQrEvent(null)}
                    style={{ background: "transparent", border: "none", fontSize: "1.4rem", cursor: "pointer", color: "var(--muted)", padding: 0 }}
                  >
                    ×
                  </button>
                </div>

                <h3 style={{ fontSize: "1.25rem", fontWeight: "800", margin: "0 0 16px 0", color: "#111" }}>{activeQrEvent.name}</h3>

                {/* QR Display */}
                <div style={{ display: "inline-block", background: "white", padding: "16px", borderRadius: "16px", border: "1px solid var(--border)", marginBottom: "16px" }}>
                  <QRCode
                    value={`${window.location.origin}/check-in/${activeQrEvent.secret}`}
                    size={180}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  />
                </div>

                {/* Expiration and copy */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
                  {timeRemainingStr && (
                    <p style={{ fontSize: "0.82rem", color: "var(--muted)", margin: 0 }}>
                      ⏳ Expires in: <strong>{timeRemainingStr}</strong>
                    </p>
                  )}
                  
                  <button
                    type="button"
                    onClick={() => {
                      const checkinLink = `${window.location.origin}/check-in/${activeQrEvent.secret}`;
                      navigator.clipboard.writeText(checkinLink);
                      alert("Check-in link copied to clipboard!");
                    }}
                    className="btn"
                    style={{ fontSize: "0.85rem", padding: "8px 12px", borderRadius: "8px" }}
                  >
                    📋 Copy Check-In Link
                  </button>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={handleRegenerateQr}
                    disabled={regeneratingQr}
                    className="btn-secondary"
                    style={{ flex: 1, fontSize: "0.82rem", padding: "8px 12px", borderRadius: "8px" }}
                  >
                    {regeneratingQr ? "Regenerating..." : "🔄 Regenerate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveQrEvent(null)}
                    className="btn"
                    style={{ flex: 1, fontSize: "0.82rem", padding: "8px 12px", background: "var(--foreground)", color: "white", borderRadius: "8px" }}
                  >
                    Close
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