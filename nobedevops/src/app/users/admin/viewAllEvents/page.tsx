"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

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
};

type EventStats = {
  totalMembers: number;
  attendedCount: number;
  excusedCount: number;
  unexcusedCount: number;
  attendanceRate: number;
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
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [gcalLoading, setGcalLoading] = useState(true);
  const [gcalError, setGcalError] = useState("");
  const [gcalSuccess, setGcalSuccess] = useState("");
  const [publicCalendarUrl, setPublicCalendarUrl] = useState("");
  const [currentPublicCalendar, setCurrentPublicCalendar] = useState("");
  const [publicGcalLoading, setPublicGcalLoading] = useState(false);
  const [unsyncLoading, setUnsyncLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState("ALL");
  const [mandatoryFilter, setMandatoryFilter] = useState("ALL");
  const [eventStats, setEventStats] = useState<EventStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function fetchEvents() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("events")
      .select("id, name, points, date, qr_code_secret, event_type, dresscode, is_mandatory, created_at, gcal_event_id")
      .order("date", { ascending: true });
    if (error) {
      setError(error.message);
    } else {
      setEvents((data as EventItem[]) || []);
    }
    setLoading(false);
  }

  async function syncAndRefetch() {
    setGcalLoading(true);
    setGcalError("");
    setGcalSuccess("");
    try {
      const res = await fetch("/api/gcal-club/sync", { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setGcalError(
          json.error.includes("Not Found")
            ? "Club calendar not found. Check that the default calendar is configured correctly."
            : json.error
        );
      } else {
        await fetchEvents();
      }
    } catch {
      setGcalError("Failed to sync Google Calendar events.");
    }
    setGcalLoading(false);
  }

  async function syncPublicCalendar() {
    if (!publicCalendarUrl.trim()) {
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
        body: JSON.stringify({ calendarId: publicCalendarUrl.trim() }),
      });
      const json = await res.json();

      if (json.error) {
        setGcalError(
          json.error.includes("Not Found")
            ? "Calendar not found or not public. Verify the link/ID and that the calendar is shared publicly."
            : json.error
        );
      } else {
        const importedLink = publicCalendarUrl.trim();
        setGcalSuccess("Public Google Calendar imported successfully.");
        setCurrentPublicCalendar(importedLink);
        setPublicCalendarUrl("");
        await fetchEvents();
      }
    } catch {
      setGcalError("Failed to sync public Google Calendar.");
    }

    setPublicGcalLoading(false);
  }

  async function unsyncCalendar() {
    setUnsyncLoading(true);
    setGcalError("");
    setGcalSuccess("");

    try {
      const res = await fetch("/api/gcal-club/unsync", {
        method: "POST",
      });
      const json = await res.json();

      if (json.error) {
        setGcalError(json.error);
      } else {
        setGcalSuccess("Imported Google Calendar events have been unsynced.");
        await fetchEvents();
      }
    } catch {
      setGcalError("Failed to unsync imported Google Calendar events.");
    }

    setUnsyncLoading(false);
  }

  useEffect(() => {
    fetchEvents();
    syncAndRefetch();
  }, []);

  useEffect(() => {
    async function fetchEventStats() {
      if (!selectedEvent || isGcalEvent(selectedEvent) || !isPastEvent(selectedEvent.date)) {
        setEventStats(null);
        return;
      }
      setStatsLoading(true);
      const [membersRes, attendanceRes, absencesRes] = await Promise.all([
        supabase.from("People").select("id, auth_id"),
        supabase.from("attendance").select("user_id, event_id").eq("event_id", selectedEvent.id),
        supabase.from("excused_absences").select("user_id, event_id, status").eq("event_id", selectedEvent.id),
      ]);
      if (membersRes.error || attendanceRes.error || absencesRes.error) {
        setEventStats(null);
        setStatsLoading(false);
        return;
      }
      const members = membersRes.data ?? [];
      const attendance = attendanceRes.data ?? [];
      const absences = absencesRes.data ?? [];
      const attendedUserIds = new Set(attendance.map((r) => r.user_id));
      const approvedExcusedUserIds = new Set(
        absences.filter((r) => r.status?.toLowerCase() === "approved").map((r) => r.user_id)
      );
      const totalMembers = members.length;
      const attendedCount = attendedUserIds.size;
      const excusedCount = members.filter(
        (m) => !attendedUserIds.has(m.auth_id) && approvedExcusedUserIds.has(m.auth_id)
      ).length;
      const unexcusedCount = members.filter(
        (m) => !attendedUserIds.has(m.auth_id) && !approvedExcusedUserIds.has(m.auth_id)
      ).length;
      const attendanceRate = totalMembers > 0 ? Math.round((attendedCount / totalMembers) * 100) : 0;
      setEventStats({ totalMembers, attendedCount, excusedCount, unexcusedCount, attendanceRate });
      setStatsLoading(false);
    }
    fetchEventStats();
  }, [selectedEvent]);

  const allEvents = useMemo(() => events, [events]);

  const filteredEvents = useMemo(() => {
    return allEvents.filter((event) => {
      const matchesSearch = event.name.toLowerCase().includes(search.toLowerCase().trim());
      const matchesEventType = selectedEventType === "ALL" || event.event_type === selectedEventType;
      const matchesMandatory =
        mandatoryFilter === "ALL" ||
        (mandatoryFilter === "MANDATORY" && event.is_mandatory === true) ||
        (mandatoryFilter === "OPTIONAL" && event.is_mandatory !== true && !isGcalEvent(event));
      return matchesSearch && matchesEventType && matchesMandatory;
    });
  }, [allEvents, search, selectedEventType, mandatoryFilter]);

  const shownEvents = useMemo(() => {
    const now = new Date();
    return filteredEvents
      .filter((e) => {
        const d = new Date(e.date);
        return !Number.isNaN(d.getTime()) && d >= now;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 4);
  }, [filteredEvents]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startDayOfWeek = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{
      date: Date | null;
      dayNumber: number | null;
      events: EventItem[];
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({ date: null, dayNumber: null, events: [], isCurrentMonth: false, isToday: false });
    }

    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      const eventsForDay = filteredEvents.filter((event) => {
        const eventDate = new Date(event.date);
        return (
          eventDate.getFullYear() === cellDate.getFullYear() &&
          eventDate.getMonth() === cellDate.getMonth() &&
          eventDate.getDate() === cellDate.getDate()
        );
      });
      const isToday =
        mounted &&
        today.getFullYear() === cellDate.getFullYear() &&
        today.getMonth() === cellDate.getMonth() &&
        today.getDate() === cellDate.getDate();
      cells.push({ date: cellDate, dayNumber: day, events: eventsForDay, isCurrentMonth: true, isToday });
    }

    while (cells.length < 42) {
      cells.push({ date: null, dayNumber: null, events: [], isCurrentMonth: false, isToday: false });
    }

    return cells;
  }, [currentMonth, filteredEvents]);

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function formatTime(dateString: string) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function isPastEvent(dateString: string) {
    const eventDate = new Date(dateString);
    return !Number.isNaN(eventDate.getTime()) && eventDate < new Date();
  }

  function statValue(key: "attendance" | "rate" | "excused" | "unexcused") {
    if (!selectedEvent || !isPastEvent(selectedEvent.date)) return "After event";
    if (statsLoading) return "Loading...";
    if (!eventStats) return "N/A";
    if (key === "attendance") return `${eventStats.attendedCount}/${eventStats.totalMembers}`;
    if (key === "rate") return `${eventStats.attendanceRate}%`;
    if (key === "excused") return `${eventStats.excusedCount}`;
    return `${eventStats.unexcusedCount}`;
  }

  const filtersActive = selectedEventType !== "ALL" || mandatoryFilter !== "ALL";

  return (
    <div className="app-shell">
      <div className="page-frame page-stack">

        <section className="hero-card">
          <div className="page-header">
            <div>
              <p className="eyebrow">Admin</p>
              <h1 className="page-title">Events calendar</h1>
            </div>
            <div className="action-row">
              <Link href="/users/admin/createEvent" className="btn">Create Event</Link>
              <Link href="/users/admin" className="btn-secondary">Back to Admin</Link>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="action-row">
            <input
              type="text"
              placeholder="Search events by title"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedEvent(null); }}
              className="field-input"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={filtersActive ? "btn" : "btn-secondary"}
            >
              {filtersActive ? "Filters Active" : "Filter"}
            </button>
          </div>

          {showFilters && (
            <div className="surface-grid auto-cards" style={{ marginTop: "16px" }}>
              <div className="field-group">
                <label className="field-label">Event Type</label>
                <select
                  value={selectedEventType}
                  onChange={(e) => { setSelectedEventType(e.target.value); setSelectedEvent(null); }}
                  className="field-select"
                >
                  <option value="ALL">All</option>
                  <option value="PROFESSIONAL">Professional</option>
                  <option value="SERVICE">Service</option>
                  <option value="SOCIAL">Social</option>
                  <option value="GENERAL_MEETING">General Meeting</option>
                  <option value="NEW_MEMBER_WORKSHOP">New Member Workshop</option>
                  <option value="PROJECT_MEETING">Project Meeting</option>
                  <option value="OTHER_MANDATORY">Other Mandatory</option>
                  <option value="GCAL_UNSPECIFIED">Google Calendar</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Requirement</label>
                <select
                  value={mandatoryFilter}
                  onChange={(e) => { setMandatoryFilter(e.target.value); setSelectedEvent(null); }}
                  className="field-select"
                >
                  <option value="ALL">All</option>
                  <option value="MANDATORY">Mandatory Only</option>
                  <option value="OPTIONAL">Optional Only</option>
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => { setSelectedEventType("ALL"); setMandatoryFilter("ALL"); setSelectedEvent(null); }}
                  className="btn"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          )}

          {gcalError && (
            <div className="message-error" style={{ marginTop: "12px" }}>
              Google Calendar sync failed: {gcalError}
            </div>
          )}
          {gcalSuccess && (
            <div className="message-success" style={{ marginTop: "12px" }}>
              {gcalSuccess}
            </div>
          )}
        </section>

        <div className="surface-grid two-up">

          <section className="panel calendar-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Calendar</p>
                <h2 className="section-title">
                  {currentMonth.toLocaleString("en-US", { month: "long", year: "numeric" })}
                </h2>
              </div>
              <div className="action-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 320px', minWidth: '220px' }}>
                  <input
                    type="text"
                    placeholder="Public Google Calendar link or ID"
                    value={publicCalendarUrl}
                    onChange={(e) => setPublicCalendarUrl(e.target.value)}
                    className="field-input"
                    style={{ width: '100%' }}
                  />
                  <p className="section-copy" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Paste a public calendar URL or calendar ID, then import. If it fails, update the link and try again.
                  </p>
                  {currentPublicCalendar && (
                    <p className="section-copy" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--muted)' }}>
                      Current calendar link: {currentPublicCalendar}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={syncPublicCalendar}
                  className="btn"
                  disabled={publicGcalLoading || unsyncLoading}
                >
                  {publicGcalLoading ? 'Importing...' : 'Import Public Calendar'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPublicCalendarUrl("");
                    setCurrentPublicCalendar("");
                    setGcalError("");
                    setGcalSuccess("");
                  }}
                  className="btn-secondary"
                  disabled={!currentPublicCalendar && !publicCalendarUrl}
                >
                  Clear Link
                </button>
                <button type="button" onClick={syncAndRefetch} className="btn-secondary" disabled={gcalLoading || unsyncLoading}>
                  {gcalLoading ? 'Syncing...' : 'Sync Club Calendar'}
                </button>
                <button type="button" onClick={unsyncCalendar} className="btn-secondary" disabled={unsyncLoading || gcalLoading || publicGcalLoading}>
                  {unsyncLoading ? 'Unsyncing...' : 'Unsync Calendar'}
                </button>
                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="btn-secondary">
                  Previous
                </button>
                <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="btn-secondary">
                  Next
                </button>
              </div>
            </div>

            <div className="calendar-compact">
              <div className="calendar-header">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="calendar-header-cell">{day}</div>
                ))}
              </div>
              <div className="calendar-grid">
                {calendarDays.map((cell, i) => (
                  <div
                    key={i}
                    className={[
                      "calendar-day",
                      !cell.isCurrentMonth ? "calendar-day-muted" : "",
                      cell.isToday ? "calendar-day-today" : "",
                    ].join(" ").trim()}
                  >
                    {cell.dayNumber !== null && (
                      <>
                        <div className="calendar-day-head">
                          <div className="calendar-day-meta">
                            <strong className="calendar-day-number">{cell.dayNumber}</strong>
                          </div>
                          {cell.isToday && <span className="today-pill">Today</span>}
                        </div>
                        <div className="calendar-events">
                          {cell.events.length === 0 ? (
                            <p className="calendar-empty-copy">{cell.isCurrentMonth ? "Open day" : ""}</p>
                          ) : (
                            cell.events.slice(0, 3).map((event) => (
                              <button
                                key={event.id}
                                type="button"
                                onClick={() => setSelectedEvent(event)}
                                className="calendar-event"
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  cursor: "pointer",
                                  boxShadow: selectedEvent?.id === event.id
                                    ? isGcalEvent(event)
                                      ? "inset 3px 0 0 #4285F4, 0 0 0 2px #4285F4"
                                      : "0 0 0 2px var(--accent)"
                                    : isGcalEvent(event)
                                      ? "inset 3px 0 0 #4285F4"
                                      : "none",
                                }}
                                title={`${event.name} — ${formatTime(event.date)}`}
                              >
                                <div className="calendar-event-topline">
                                  <div className="calendar-event-time">{formatTime(event.date)}</div>
                                  {event.is_mandatory && <span className="calendar-event-chip">Mandatory</span>}
                                  {isGcalEvent(event) && (
                                    <span className="calendar-event-chip" style={{ background: "#4285F4", color: "#fff", fontSize: "0.6rem" }}>G</span>
                                  )}
                                </div>
                                <div className="calendar-event-name">{event.name}</div>
                              </button>
                            ))
                          )}
                          {cell.events.length > 3 && (
                            <div className="calendar-more-events">+{cell.events.length - 3} more</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "8px" }}>
              <p className="section-copy" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                {gcalLoading ? "Syncing Google Calendar..." : "Blue-bordered events are from the NOBE Google Calendar."}
              </p>
              <button
                type="button"
                onClick={syncAndRefetch}
                disabled={gcalLoading}
                className="btn-secondary"
                style={{ fontSize: "0.75rem", padding: "4px 10px" }}
              >
                {gcalLoading ? "Syncing..." : "Sync GCal"}
              </button>
            </div>
          </section>

          <section className="panel">
            {loading && <p className="section-copy">Loading events...</p>}
            {!loading && error && <div className="message-error">{error}</div>}

            {!loading && !error && selectedEvent ? (
              <div className="page-stack">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">{isGcalEvent(selectedEvent) ? "Google Calendar Event" : "Selected Event"}</p>
                    <h2 className="section-title">{selectedEvent.name}</h2>
                  </div>
                  <div className="action-row">
                    <button type="button" onClick={() => setSelectedEvent(null)} className="btn-secondary">
                      ← Back
                    </button>
                    {!isGcalEvent(selectedEvent) && (
                      <Link href={`/users/admin/createEvent?eventId=${selectedEvent.id}`} className="btn">
                        Edit
                      </Link>
                    )}
                  </div>
                </div>

                <div className="action-row">
                  {selectedEvent.is_mandatory && <span className="calendar-event-chip">Mandatory</span>}
                  <span className="calendar-event-chip">
                    {isGcalEvent(selectedEvent) ? "Google Calendar" : selectedEvent.event_type.replaceAll("_", " ")}
                  </span>
                  {!isGcalEvent(selectedEvent) && selectedEvent.dresscode && (
                    <span className="calendar-event-chip">{selectedEvent.dresscode}</span>
                  )}
                </div>

                <div className="subtle-card list-stack">
                  <div className="metric-pair">
                    <span>Date &amp; Time</span>
                    <span>{formatDate(selectedEvent.date)}</span>
                  </div>
                  {selectedEvent.end_date && (
                    <div className="metric-pair">
                      <span>End Time</span>
                      <span>{formatTime(selectedEvent.end_date)}</span>
                    </div>
                  )}
                  {selectedEvent.location && (
                    <div className="metric-pair">
                      <span>Location</span>
                      <span>{selectedEvent.location}</span>
                    </div>
                  )}
                  {!isGcalEvent(selectedEvent) && (
                    <>
                      <div className="metric-pair">
                        <span>Dress Code</span>
                        <span>{selectedEvent.dresscode ?? "N/A"}</span>
                      </div>
                      <div className="metric-pair">
                        <span>Points</span>
                        <span>{selectedEvent.points ?? 0}</span>
                      </div>
                      <div className="metric-pair">
                        <span>Requirement</span>
                        <span>{selectedEvent.is_mandatory ? "Mandatory" : "Optional"}</span>
                      </div>
                      <div className="metric-pair">
                        <span>Created</span>
                        <span>{formatDate(selectedEvent.created_at)}</span>
                      </div>
                    </>
                  )}
                  {isGcalEvent(selectedEvent) && selectedEvent.description && (
                    <div className="metric-pair" style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
                      <span>Description</span>
                      <span style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>{selectedEvent.description}</span>
                    </div>
                  )}
                </div>

                {!isGcalEvent(selectedEvent) && (
                  <>
                    <div className="subtle-card">
                      <p className="eyebrow" style={{ marginBottom: "12px" }}>Attendance</p>
                      <div className="list-stack">
                        <div className="metric-pair">
                          <span>Attended</span>
                          <span>{statValue("attendance")}</span>
                        </div>
                        <div className="metric-pair">
                          <span>Rate</span>
                          <span>{statValue("rate")}</span>
                        </div>
                        {selectedEvent.is_mandatory && (
                          <>
                            <div className="metric-pair">
                              <span>Excused</span>
                              <span>{statValue("excused")}</span>
                            </div>
                            <div className="metric-pair">
                              <span>Unexcused</span>
                              <span>{statValue("unexcused")}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <Link href={`/users/admin/eventReview?eventId=${selectedEvent.id}`} className="btn-secondary" style={{ textAlign: "center" }}>
                      Open Full Review Page
                    </Link>
                  </>
                )}

                {isGcalEvent(selectedEvent) && (
                  <p className="section-copy" style={{ fontSize: "0.8rem", color: "var(--muted)", textAlign: "center" }}>
                    This event is sourced from the NOBE club Google Calendar and is read-only.
                  </p>
                )}
              </div>
            ) : (
              !loading && !error && (
                <div className="page-stack">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Upcoming</p>
                      <h2 className="section-title">Next events</h2>
                    </div>
                  </div>
                  {shownEvents.length === 0 ? (
                    <div className="empty-state">No upcoming events found.</div>
                  ) : (
                    <div className="list-stack">
                      {shownEvents.map((event) => (
                        <div key={event.id} className="subtle-card" style={{ boxShadow: isGcalEvent(event) ? "inset 3px 0 0 #4285F4" : undefined }}>
                          <div className="panel-header" style={{ marginBottom: "10px" }}>
                            <strong>{event.name}</strong>
                            <span className="calendar-event-chip">
                              {event.is_mandatory ? "Mandatory" : isGcalEvent(event) ? "Unspecified" : "Optional"}
                            </span>
                          </div>
                          <p className="section-copy">{formatDate(event.date)}</p>
                          {!isGcalEvent(event) && (
                            <p className="section-copy">
                              {event.event_type.replaceAll("_", " ")} · {event.points ?? 0} pts
                            </p>
                          )}
                          {event.location && (
                            <p className="section-copy">{event.location}</p>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedEvent(event)}
                            className="btn"
                            style={{ marginTop: "10px" }}
                          >
                            See Details
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </section>

        </div>
      </div>
    </div>
  );
}