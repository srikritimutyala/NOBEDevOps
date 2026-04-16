"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import type { CSSProperties } from "react";

type EventItem = {
  id: string;
  name: string;
  points: number | null;
  date: string;
  qr_code_secret: string | null;
  event_type: string;
  is_mandatory: boolean | null;
  created_at: string;
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

export default function ViewAllEvents() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEventType, setSelectedEventType] = useState("ALL");
  const [mandatoryFilter, setMandatoryFilter] = useState("ALL");
  const [eventStats, setEventStats] = useState<EventStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("events")
        .select(
          "id, name, points, date, qr_code_secret, event_type, is_mandatory, created_at"
        )
        .order("date", { ascending: true });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setEvents((data as EventItem[]) || []);
      setLoading(false);
    }

    fetchEvents();
  }, []);

  useEffect(() => {
    async function fetchEventStats() {
      if (!selectedEvent || !isPastEvent(selectedEvent.date)) {
        setEventStats(null);
        return;
      }

      setStatsLoading(true);

      const [membersRes, attendanceRes, absencesRes] = await Promise.all([
        supabase.from("People").select("id, auth_id"),
        supabase
          .from("attendance")
          .select("user_id, event_id")
          .eq("event_id", selectedEvent.id),
        supabase
          .from("excused_absences")
          .select("user_id, event_id, status")
          .eq("event_id", selectedEvent.id)
      ]);

      if (membersRes.error || attendanceRes.error || absencesRes.error) {
        setEventStats(null);
        setStatsLoading(false);
        return;
      }

      const members = membersRes.data ?? [];
      const attendance = attendanceRes.data ?? [];
      const absences = absencesRes.data ?? [];

      const attendedUserIds = new Set(attendance.map((row) => row.user_id));

      const approvedExcusedUserIds = new Set(
        absences
          .filter((row) => row.status?.toLowerCase() === "approved")
          .map((row) => row.user_id)
      );

      const totalMembers = members.length;
      const attendedCount = attendedUserIds.size;

      const excusedCount = members.filter(
        (member) =>
          !attendedUserIds.has(member.auth_id) &&
          approvedExcusedUserIds.has(member.auth_id)
      ).length;

      const unexcusedCount = members.filter(
        (member) =>
          !attendedUserIds.has(member.auth_id) &&
          !approvedExcusedUserIds.has(member.auth_id)
      ).length;

      const attendanceRate =
        totalMembers > 0 ? Math.round((attendedCount / totalMembers) * 100) : 0;

      setEventStats({
        totalMembers,
        attendedCount,
        excusedCount,
        unexcusedCount,
        attendanceRate,
      });

      setStatsLoading(false);
    }

    fetchEventStats();
  }, [selectedEvent]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesSearch = event.name
        .toLowerCase()
        .includes(search.toLowerCase().trim());

      const matchesEventType =
        selectedEventType === "ALL" || event.event_type === selectedEventType;

      const matchesMandatory =
        mandatoryFilter === "ALL" ||
        (mandatoryFilter === "MANDATORY" && event.is_mandatory === true) ||
        (mandatoryFilter === "OPTIONAL" && event.is_mandatory !== true);

      return matchesSearch && matchesEventType && matchesMandatory;
    });
  }, [events, search, selectedEventType, mandatoryFilter]);

  const shownEvents = useMemo(() => {
    const now = new Date();

    return filteredEvents
        .filter((event) => {
            const eventDate = new Date(event.date);
            return !Number.isNaN(eventDate.getTime()) && eventDate >= now;
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
      cells.push({
        date: null,
        dayNumber: null,
        events: [],
        isCurrentMonth: false,
        isToday: false,
      });
    }

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

      const today = new Date();
      const isToday =
        today.getFullYear() === cellDate.getFullYear() &&
        today.getMonth() === cellDate.getMonth() &&
        today.getDate() === cellDate.getDate();

      cells.push({
        date: cellDate,
        dayNumber: day,
        events: eventsForDay,
        isCurrentMonth: true,
        isToday,
      });
    }

    while (cells.length < 42) {
      cells.push({
        date: null,
        dayNumber: null,
        events: [],
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return cells;
  }, [currentMonth, filteredEvents]);

  function formatDate(dateString: string) {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return dateString;
    }

    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatTime(dateString: string) {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function monthLabel(date: Date) {
    return date.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  function goToPreviousMonth() {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    );
  }

  function goToNextMonth() {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    );
  }

  function isPastEvent(dateString: string) {
    const eventDate = new Date(dateString);
    return !Number.isNaN(eventDate.getTime()) && eventDate < new Date();
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>Administrator Dashboard</h1>

        <div style={styles.topPanels}>
          <div style={styles.largePanel}>
            <div style={styles.panelTitle}>Events Calendar View</div>

            <div style={styles.searchBar}>
              <div style={styles.searchRow}>
                <input
                    type="text"
                    placeholder="Search events by title"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setSelectedEvent(null);
                    }}
                    style={styles.searchInput}
                />

                <button
                    type="button"
                    onClick={() => setShowFilters((prev) => !prev)}
                    style={styles.filterButton}
                >
                    {selectedEventType !== "ALL" || mandatoryFilter !== "ALL"
                        ? "Filters Applied"
                        : "Filter"}
                </button>
              </div>

              {showFilters && (
                <div style={styles.filterPanel}>
                    <div style={styles.filterGroup}>
                        <label style={styles.filterLabel}>Event Type</label>
                        <select
                            value={selectedEventType}
                            onChange={(e) => {
                                setSelectedEventType(e.target.value);
                                setSelectedEvent(null);
                            }}
                            style={styles.filterSelect}
                        >
                            <option value="ALL">All</option>
                            <option value="PROFESSIONAL">Professional</option>
                            <option value="PHILANTHROPY">Philanthropy</option>
                            <option value="SOCIAL">Social</option>
                            <option value="GENERAL_MEETING">General Meeting</option>
                            <option value="NEW_MEMBER_WORKSHOP">New Member Workshop</option>
                            <option value="PROJECT_MEETING">Project Meeting</option>
                            <option value="OTHER_MANDATORY">Other Mandatory</option>
                        </select>
                    </div>

                    <div style={styles.filterGroup}>
                        <label style={styles.filterLabel}>Requirement</label>
                        <select
                            value={mandatoryFilter}
                            onChange={(e) => {
                                setMandatoryFilter(e.target.value);
                                setSelectedEvent(null);
                            }}
                            style={styles.filterSelect}
                        >
                        <option value="ALL">All</option>
                        <option value="MANDATORY">Mandatory Only</option>
                        <option value="OPTIONAL">Optional Only</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setSelectedEventType("ALL");
                            setMandatoryFilter("ALL");
                            setSelectedEvent(null);
                        }}
                        style={styles.clearFiltersButton}
                    >
                        Clear Filters
                    </button>
                </div>
              )}
            </div>

            <div style={styles.calendarToolbar}>
              <button type="button" onClick={goToPreviousMonth} style={styles.monthButton}>
                ←
              </button>
              <div style={styles.monthLabel}>{monthLabel(currentMonth)}</div>
              <button type="button" onClick={goToNextMonth} style={styles.monthButton}>
                →
              </button>
            </div>

            <div style={styles.calendarBox}>
              <div style={styles.calendarHeaderRow}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} style={styles.calendarHeaderCell}>
                    {day}
                  </div>
                ))}
              </div>

              <div style={styles.calendarGrid}>
                {calendarDays.map((cell, i) => (
                  <div
                    key={i}
                    style={{
                      ...styles.calendarCell,
                      ...(cell.isCurrentMonth ? {} : styles.calendarCellInactive),
                      ...(cell.isToday ? styles.calendarCellToday : {}),
                    }}
                  >
                    {cell.dayNumber !== null && (
                      <>
                        <div style={styles.dayNumber}>{cell.dayNumber}</div>

                        <div style={styles.dayEvents}>
                          {cell.events.slice(0, 3).map((event) => (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => setSelectedEvent(event)}
                              style={{
                                ...styles.calendarEvent,
                                ...(selectedEvent?.id === event.id ? styles.calendarEventSelected : {}),
                              }}
                              title={`${event.name} - ${formatTime(event.date)}`}
                            >
                              <div style={styles.calendarEventTime}>{formatTime(event.date)}</div>
                              <div style={styles.calendarEventName}>{event.name}</div>
                            </button>
                          ))}

                          {cell.events.length > 3 && (
                            <div style={styles.moreEventsText}>
                              +{cell.events.length - 3} more
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.largePanel}>
            <div style={styles.panelTitle}>
                {selectedEvent ? "Selected Event" : "Upcoming Events"}
            </div>
            <div style={styles.panelText}>
            </div>

            <div style={styles.eventsList}>
              {loading && <div style={styles.infoText}>Loading events...</div>}

              {!loading && error && <div style={styles.errorText}>{error}</div>}
              
              {!loading && !error && selectedEvent && (
  <div style={styles.selectedEventLayout}>
    <div style={styles.selectedEventTopBar}>
      <button
        type="button"
        onClick={() => setSelectedEvent(null)}
        style={styles.clearSelectionButton}
      >
        ← Back
      </button>

      <Link
        href={`/users/admin/createEvent?eventId=${selectedEvent.id}`}
        style={styles.editEventButton}
      >
        Edit Event Details
      </Link>
    </div>

    <div style={styles.selectedEventGrid}>
      <div style={styles.selectedEventMainCard}>
        <div style={styles.selectedEventTitle}>{selectedEvent.name}</div>

        <div style={styles.selectedEventBadgeRow}>
          <div style={styles.badge}>
            {selectedEvent.is_mandatory ? "Mandatory" : "Optional"}
          </div>
          <div style={styles.badge}>{selectedEvent.event_type}</div>
        </div>

        <div style={styles.selectedEventDetailsList}>
          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Date & Time</span>
            <span style={styles.detailValue}>{formatDate(selectedEvent.date)}</span>
          </div>

          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Points</span>
            <span style={styles.detailValue}>
              {selectedEvent.points !== null ? selectedEvent.points : 0}
            </span>
          </div>

          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Event Type</span>
            <span style={styles.detailValue}>{selectedEvent.event_type}</span>
          </div>

          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Requirement</span>
            <span style={styles.detailValue}>
              {selectedEvent.is_mandatory ? "Mandatory" : "Optional"}
            </span>
          </div>

          <div style={styles.detailRow}>
            <span style={styles.detailLabel}>Created At</span>
            <span style={styles.detailValue}>
              {formatDate(selectedEvent.created_at)}
            </span>
          </div>
        </div>
      </div>

      <div style={styles.selectedEventSideCard}>
        <div>
          <div style={styles.sideCardTitle}>Event Overview</div>

          <div style={styles.sideStatList}>
            <div style={styles.sideStatItem}>
              <span style={styles.sideStatLabel}>Attendance</span>
              <span style={styles.sideStatValue}>
                {!selectedEvent
                  ? "-"
                  : !isPastEvent(selectedEvent.date)
                  ? "Available after event"
                  : statsLoading
                  ? "Loading..."
                  : eventStats
                  ? `${eventStats.attendedCount}/${eventStats.totalMembers}`
                  : "Unavailable"}
              </span>
            </div>

            <div style={styles.sideStatItem}>
              <span style={styles.sideStatLabel}>Attendance Rate</span>
              <span style={styles.sideStatValue}>
                {!selectedEvent
                  ? "-"
                  : !isPastEvent(selectedEvent.date)
                  ? "Available after event"
                  : statsLoading
                  ? "Loading..."
                  : eventStats
                  ? `${eventStats.attendanceRate}%`
                  : "Unavailable"}
              </span>
            </div>

            {selectedEvent?.is_mandatory === true && (
              <>
                <div style={styles.sideStatItem}>
                  <span style={styles.sideStatLabel}>Excused Absences</span>
                  <span style={styles.sideStatValue}>
                    {!isPastEvent(selectedEvent.date)
                      ? "Available after event"
                      : statsLoading
                      ? "Loading..."
                      : eventStats
                      ? `${eventStats.excusedCount}`
                      : "Unavailable"}
                  </span>
                </div>

                <div style={styles.sideStatItem}>
                  <span style={styles.sideStatLabel}>Unexcused Absences</span>
                  <span style={styles.sideStatValue}>
                    {!isPastEvent(selectedEvent.date)
                      ? "Available after event"
                      : statsLoading
                      ? "Loading..."
                      : eventStats
                      ? `${eventStats.unexcusedCount}`
                      : "Unavailable"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Link
        href={`/users/admin/eventReview?eventId=${selectedEvent.id}`}
        style={styles.secondaryDetailsButton}
      >
        Open Full Review Page
      </Link>
    </div>
  </div>
)}

              {!loading && !error && !selectedEvent && shownEvents.length === 0 && (
                <div style={styles.infoText}>No events found.</div>
              )}

              {!loading &&
                !error &&
                !selectedEvent &&
                shownEvents.map((event) => (
                  <div key={event.id} style={styles.eventCard}>
                    <div style={styles.eventCardHeader}>
                      <div style={styles.eventName}>{event.name}</div>
                      <div style={styles.badge}>
                        {event.is_mandatory ? "Mandatory" : "Optional"}
                      </div>
                    </div>

                    <div style={styles.eventMeta}>{formatDate(event.date)}</div>
                    <div style={styles.eventMeta}>Type: {event.event_type}</div>
                    <div style={styles.eventMeta}>
                      Points: {event.points !== null ? event.points : 0}
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                      style={styles.detailsButton}
                    >
                      See Details
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div style={styles.actionRow}>
            <Link href="/users/admin/createEvent" style={styles.primaryButton}>
                Create Event
            </Link>

        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  page: {
    minHeight: "100vh",
    background: "#000000",
    color: "#ffffff",
    padding: "32px 24px",
    fontFamily: "Inter, Arial, sans-serif",
  },
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
  },
  title: {
    fontSize: "56px",
    fontWeight: 800,
    margin: "0 0 12px 0",
    letterSpacing: "-1px",
  },
  subtitle: {
    fontSize: "18px",
    color: "#a3a3a3",
    margin: "0 0 32px 0",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "22px",
    marginBottom: "28px",
  },
  statCard: {
    background: "#050505",
    border: "1px solid #2d2d2d",
    borderRadius: "18px",
    padding: "26px 24px",
    minHeight: "120px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.02) inset",
  },
  statLabel: {
    color: "#a3a3a3",
    fontSize: "18px",
    fontWeight: 600,
    lineHeight: 1.35,
  },
  statValue: {
    fontSize: "42px",
    fontWeight: 800,
    color: "#ffffff",
  },
  topPanels: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: "22px",
    marginBottom: "28px",
  },
  largePanel: {
    background: "#030303",
    border: "1px dashed #444",
    borderRadius: "18px",
    padding: "24px",
  },
  panelTitle: {
    fontSize: "28px",
    fontWeight: 700,
    marginBottom: "8px",
  },
  panelText: {
    fontSize: "16px",
    color: "#a3a3a3",
    lineHeight: 1.5,
    marginBottom: "20px",
  },
  searchBar: {
    marginBottom: "16px",
  },
  searchInput: {
    width: "100%",
    background: "#161616",
    color: "#ffffff",
    border: "1px solid #2f2f2f",
    borderRadius: "12px",
    padding: "14px 16px",
    fontSize: "16px",
    outline: "none",
  },
  calendarToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
    gap: "12px",
  },
  monthButton: {
    background: "#151515",
    color: "#ffffff",
    border: "1px solid #2f2f2f",
    borderRadius: "10px",
    padding: "8px 14px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: 700,
  },
  monthLabel: {
    fontSize: "18px",
    fontWeight: 700,
    color: "#f5f5f5",
  },
  calendarBox: {
    background: "#111111",
    borderRadius: "14px",
    overflow: "hidden",
    border: "1px solid #2b2b2b",
  },
  calendarHeaderRow: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    background: "#181818",
    borderBottom: "1px solid #2b2b2b",
  },
  calendarHeaderCell: {
    padding: "12px 8px",
    textAlign: "center",
    fontWeight: 600,
    color: "#bdbdbd",
    fontSize: "14px",
  },
  calendarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
  },
  calendarCell: {
    minHeight: "140px",
    borderRight: "1px solid #222",
    borderBottom: "1px solid #222",
    background: "#101010",
    padding: "8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    overflow: "hidden",
  },
  calendarCellInactive: {
    background: "#0a0a0a",
  },
  calendarCellToday: {
    boxShadow: "inset 0 0 0 1px #ffffff",
  },
  dayNumber: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#d4d4d4",
    marginBottom: "8px",
  },
  dayEvents: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    width: "100%",
    overflow: "hidden",
  },
  calendarEvent: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    width: "100%",
    height: "46px",
    minHeight: "44px",
    maxHeight: "46px",
    background: "#1d1d1d",
    border: "1px solid #2e2e2e",
    borderRadius: "8px",
    padding: "6px 8px",
    color: "#ffffff",
    fontSize: "11px",
    lineHeight: 1.1,
    boxSizing: "border-box",
    overflow: "hidden",
    cursor: "pointer",
    textAlign: "left",
  },
  calendarEventSelected: {
    border: "1px solid #ffffff",
    boxShadow: "0 0 0 1px #ffffff inset",
  },
  clearSelectionButton: {
    background: "#111111",
    color: "#ffffff",
    border: "1px solid #2d2d2d",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  calendarEventTime: {
    display: "block",
    color: "#c7c7c7",
    fontWeight: 600,
    marginBottom: "2px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  calendarEventName: {
    display: "block",
    width: "100%",
    fontWeight: 700,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  moreEventsText: {
    fontSize: "11px",
    color: "#9d9d9d",
    fontWeight: 600,
    paddingTop: "2px",
  },
  eventsList: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  eventCard: {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: "14px",
    padding: "16px",
  },
  eventCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "10px",
  },
  eventName: {
    fontSize: "18px",
    fontWeight: 700,
  },
  badge: {
    background: "#222222",
    border: "1px solid #333333",
    color: "#d4d4d4",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  eventMeta: {
    color: "#b3b3b3",
    fontSize: "14px",
    marginBottom: "6px",
  },
  detailsButton: {
    display: "inline-block",
    marginTop: "10px",
    background: "#ffffff",
    color: "#000000",
    textDecoration: "none",
    fontWeight: 700,
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    border: "none",
    cursor: "pointer",
  },
  bottomSection: {
    marginBottom: "26px",
  },
  widePanel: {
    background: "#030303",
    border: "1px solid #2d2d2d",
    borderRadius: "18px",
    padding: "24px",
  },
  tableWrapper: {
    marginTop: "16px",
    border: "1px solid #242424",
    borderRadius: "12px",
    overflow: "hidden",
  },
  tableHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 2fr 1.2fr 0.8fr 0.8fr",
    gap: "12px",
    background: "#151515",
    padding: "14px 16px",
    fontWeight: 700,
    color: "#d4d4d4",
    fontSize: "14px",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "2fr 2fr 1.2fr 0.8fr 0.8fr",
    gap: "12px",
    padding: "14px 16px",
    borderTop: "1px solid #202020",
    color: "#f5f5f5",
    fontSize: "14px",
    alignItems: "center",
  },
  inlineLink: {
    color: "#ffffff",
    fontWeight: 700,
    textDecoration: "underline",
  },
  actionRow: {
    display: "flex",
    gap: "14px",
    flexWrap: "wrap",
  },
  primaryButton: {
    background: "#ffffff",
    color: "#000000",
    textDecoration: "none",
    fontWeight: 800,
    padding: "14px 20px",
    borderRadius: "12px",
    fontSize: "16px",
  },
  secondaryButton: {
    background: "#111111",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 700,
    padding: "14px 20px",
    borderRadius: "12px",
    fontSize: "16px",
    border: "1px solid #2d2d2d",
  },
  infoText: {
    color: "#b3b3b3",
    fontSize: "15px",
    padding: "8px 0",
  },
  errorText: {
    color: "#ff9b71",
    fontSize: "15px",
    fontWeight: 600,
    padding: "8px 0",
  },
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    },

  filterButton: {
    background: "#111111",
    color: "#ffffff",
    border: "1px solid #2f2f2f",
    borderRadius: "12px",
    padding: "14px 16px",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  filterPanel: {
    marginTop: "12px",
    background: "#111111",
    border: "1px solid #2a2a2a",
    borderRadius: "14px",
    padding: "14px",
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    alignItems: "end",
  },

  filterGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: "200px",
  },

  filterLabel: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#c7c7c7",
  },

  filterSelect: {
    background: "#1a1a1a",
    color: "#ffffff",
    border: "1px solid #2f2f2f",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "14px",
    outline: "none",
  },

  clearFiltersButton: {
    background: "#ffffff",
    color: "#000000",
    border: "none",
    borderRadius: "10px",
    padding: "10px 14px",
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
  },

  selectedEventLayout: {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
},

selectedEventTopBar: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
},

selectedEventGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "16px",
},

selectedEventMainCard: {
  background: "#141414",
  border: "1px solid #2a2a2a",
  borderRadius: "18px",
  padding: "22px",
  minHeight: "420px",
},

selectedEventSideCard: {
  background: "#141414",
  border: "1px solid #2a2a2a",
  borderRadius: "18px",
  padding: "22px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  minHeight: "420px",
},

selectedEventTitle: {
  fontSize: "30px",
  fontWeight: 800,
  marginBottom: "16px",
  lineHeight: 1.15,
},

selectedEventBadgeRow: {
  display: "flex",
  gap: "10px",
  flexWrap: "wrap",
  marginBottom: "22px",
},

selectedEventDetailsList: {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
},

detailRow: {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  paddingBottom: "12px",
  borderBottom: "1px solid #242424",
  alignItems: "flex-start",
},

detailLabel: {
  fontSize: "14px",
  color: "#9f9f9f",
  fontWeight: 600,
  minWidth: "120px",
},

detailValue: {
  fontSize: "15px",
  color: "#ffffff",
  fontWeight: 600,
  textAlign: "right",
},

sideCardTitle: {
  fontSize: "22px",
  fontWeight: 700,
  marginBottom: "18px",
},

sideStatList: {
  display: "flex",
  flexDirection: "column",
  gap: "14px",
  marginBottom: "18px",
},

sideStatItem: {
  display: "flex",
  justifyContent: "space-between",
  gap: "12px",
  paddingBottom: "10px",
  borderBottom: "1px solid #242424",
},

sideStatLabel: {
  fontSize: "14px",
  color: "#b5b5b5",
  fontWeight: 600,
},

sideStatValue: {
  fontSize: "14px",
  color: "#ffffff",
  fontWeight: 700,
  textAlign: "right",
},

editEventButton: {
  display: "inline-block",
  background: "#ffffff",
  color: "#000000",
  textDecoration: "none",
  fontWeight: 700,
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "14px",
},

secondaryDetailsButton: {
  display: "inline-block",
  marginTop: "10px",
  background: "#111111",
  color: "#ffffff",
  textDecoration: "none",
  fontWeight: 700,
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "14px",
  border: "1px solid #2d2d2d",
},
};