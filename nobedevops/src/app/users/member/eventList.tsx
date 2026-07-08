'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../authprovider';
import { getMemberStrikes } from './actions';
import LogoutButton from '../login/logout';

interface Event {
  id: string;
  name: string;
  event_type: string;
  dresscode?: string;
  date: string;
  points: number;
  is_mandatory: boolean;
  location?: string;
}

interface Strike {
  id: string;
  event_id: string | null;
  strike_type: string;
  reason: string;
  source: string;
  status: string;
  admin_note: string | null;
  created_at: string | null;
}

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; borderColor: string }> = {
  PROFESSIONAL: { label: 'Professional', color: '#FF7043', borderColor: '#E64A19' },
  SOCIAL: { label: 'Social', color: '#FF9999', borderColor: '#FF6666' },
  SERVICE: { label: 'Service/Philanthropy', color: '#9FBB9F', borderColor: '#7A9B7A' },
  'SERVICE / PHILANTHROPY': { label: 'Service/Philanthropy', color: '#9FBB9F', borderColor: '#7A9B7A' },
  GENERAL_MEETING: { label: 'General Meeting', color: '#424242', borderColor: '#212121' },
  MANDATORY: { label: 'Mandatory', color: '#FFEBEE', borderColor: '#EF5350' },
  OTHER_MANDATORY: { label: 'Mandatory', color: '#FFEBEE', borderColor: '#EF5350' },
  GOOGLE_CALENDAR: { label: 'Google Calendar', color: '#B3E5FC', borderColor: '#0288D1' },
  PROJECT_MEETING: { label: 'Project Meeting', color: '#FFD54F', borderColor: '#FBC02D' },
  NEW_MEMBER_WORKSHOP: { label: 'New Member Workshop', color: '#CE93D8', borderColor: '#AF2CC5' },
};

const EVENT_TYPES = Object.keys(EVENT_TYPE_CONFIG);

interface MemberProfile {
  name: string | null;
  year: string | null;
  college: string | null;
  committee: string | null;
  social_points: number | null;
  professional_points: number | null;
  service_points: number | null;
  strikes: number | null;
  auth_id: string | null;
}

export default function EventList() {
  const { session } = useAuth();
  const [nobeEvents, setNobeEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [authId, setAuthId] = useState<string | null>(null);
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const [googleEvents, setGoogleEvents] = useState<Event[]>([]);
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set(EVENT_TYPES));
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [addedEvents, setAddedEvents] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const [viewMode, setViewMode] = useState<"CALENDAR" | "LIST">("CALENDAR");


  useEffect(() => {
    setMounted(true);
  }, []);

  const pathname = usePathname();
  const currentPath = pathname?.replace(/\/$/, '') || '';

  useEffect(() => {
    const fetchGoogleEvents = async () => {
      try {
        const res = await fetch('/api/gcal-personal/events');

        if (!res.ok) return;

        const data = await res.json();
        setGoogleEvents(data.events || []);
      } catch {
        // user may not have connected Google yet
      }
    };

    fetchGoogleEvents();
  }, []);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || '',
          process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ''
        );

        const { data, error: fetchError } = await supabase
          .from('events')
          .select('*')
          .order('date', { ascending: false });

        if (fetchError) throw fetchError;
        setNobeEvents(data || []);
        setLoading(false);

        fetch('/api/gcal-club/sync', { method: 'POST' })
          .then(() => supabase.from('events').select('*').order('date', { ascending: false }))
          .then(({ data: fresh }) => {
            if (fresh) setNobeEvents(fresh);
          })
          .catch(() => {});
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch events');
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  useEffect(() => {
    const fetchMember = async () => {
      if (!session?.user?.id) {
        setMemberLoading(false);
        setMemberError('No session found');
        return;
      }

      setAuthId(session.user.id);
      setMemberLoading(true);

      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ''
      );

      const { data, error: fetchError } = await supabase
        .from('People')
        .select(
          'name, year, college, committee, social_points, professional_points, service_points, strikes, auth_id'
        )
        .eq('auth_id', session.user.id)
        .single();

      if (fetchError) {
        setMemberError(fetchError.message);
        setMember(null);
        setStrikes([]);
      } else {
        setMember(data as MemberProfile);

        try {
          const strikeData = await getMemberStrikes();
          setStrikes(strikeData || []);
        } catch (err) {
          console.error('Failed to fetch strikes:', err);
          setStrikes([]);
        }
      }

      setMemberLoading(false);
    };

    if (session) {
      fetchMember();
    }
  }, [session]);

  const toggleFilter = (eventType: string) => {
    const newFilters = new Set(selectedFilters);
    if (newFilters.has(eventType)) {
      newFilters.delete(eventType);
    } else {
      newFilters.add(eventType);
    }
    setSelectedFilters(newFilters);
  };

  const toggleAllFilters = () => {
    if (selectedFilters.size === EVENT_TYPES.length) {
      setSelectedFilters(new Set());
    } else {
      setSelectedFilters(new Set(EVENT_TYPES));
    }
  };

  const hasTimeConflict = (event1: Event, event2: Event): boolean => {
    if (
      event1.event_type === event2.event_type ||
      (event1.event_type !== 'GOOGLE_CALENDAR' && event2.event_type !== 'GOOGLE_CALENDAR')
    ) {
      return false;
    }

    const date1 = new Date(event1.date);
    const date2 = new Date(event2.date);

    if (date1.toDateString() !== date2.toDateString()) {
      return false;
    }

    const event1End = new Date(date1.getTime() + 60 * 60 * 1000);
    const event2End = new Date(date2.getTime() + 60 * 60 * 1000);

    return date1 < event2End && date2 < event1End;
  };

  const addEventToGoogleCalendar = async (event: Event) => {
    try {
      setAddedEvents((prev) => new Set(prev).add(event.id));

      const res = await fetch('/api/gcal-personal/add-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      });

      if (!res.ok) {
        throw new Error('Failed to add event');
      }

      alert('Added to Google Calendar!');
    } catch {
      alert('Could not add event to Google Calendar.');
    }
  };

  const events = useMemo(() => {
    const nobeEventKeys = new Set(
      nobeEvents.map((e) => `${e.name}|${new Date(e.date).toDateString()}`)
    );

    const combined = [
      ...nobeEvents,
      ...googleEvents.filter((gEvent) => {
        const eventKey = `${gEvent.name}|${new Date(gEvent.date).toDateString()}`;
        return !nobeEventKeys.has(eventKey);
      }),
    ];

    return combined.filter((event) => selectedFilters.has(event.event_type));
  }, [nobeEvents, googleEvents, selectedFilters]);

  const monthEvents = useMemo(() => {
    return events.filter(event => {
      const d = new Date(event.date);
      return d.getFullYear() === displayMonth.getFullYear() && d.getMonth() === displayMonth.getMonth();
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [events, displayMonth]);

  const eventConflicts = useMemo(() => {
    const conflicts = new Map<string, boolean>();

    events.forEach((event) => {
      const hasConflict = events.some((otherEvent) => event.id !== otherEvent.id && hasTimeConflict(event, otherEvent));
      conflicts.set(event.id, hasConflict);
    });

    return conflicts;
  }, [events]);

  const eventDateKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

  const eventsByDate = useMemo(
    () =>
      events.reduce<Record<string, Event[]>>((acc, event) => {
        const eventDate = new Date(event.date);
        const key = eventDateKey(eventDate);
        if (!acc[key]) acc[key] = [];
        acc[key].push(event);
        return acc;
      }, {}),
    [events]
  );

  const monthStart = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
  const firstDayOfCalendar = new Date(monthStart);
  firstDayOfCalendar.setDate(monthStart.getDate() - monthStart.getDay());

  const calendarDays = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) => {
        const date = new Date(firstDayOfCalendar);
        date.setDate(firstDayOfCalendar.getDate() + index);
        return date;
      }),
    [firstDayOfCalendar]
  );

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return events
      .filter((event) => new Date(event.date).getTime() >= now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 4);
  }, [events]);

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = new Date();

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const changeMonth = (offset: number) => {
    setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  if (loading) {
    return (
      <div className="app-shell">
        <div className="page-frame">
          <div className="panel">
            <p className="section-copy">Loading events...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="page-frame">
          <div className="message-error">Error: {error}</div>
        </div>
      </div>
    );
  }

  const totalPoints =
    (member?.social_points ?? 0) +
    (member?.professional_points ?? 0) +
    (member?.service_points ?? 0);

  const monthEventCount = calendarDays.reduce((count, date) => {
    if (date.getMonth() !== displayMonth.getMonth()) {
      return count;
    }

    return count + (eventsByDate[eventDateKey(date)]?.length ?? 0);
  }, 0);

  return (
    <div className="app-shell">
      <div className="page-frame page-stack">
        <section className="hero-card">
          <div className="page-header">
            <div>
              <div className="pill-nav">
                <span className={currentPath === '/users/member' ? 'pill-link-active' : 'pill-link'}>
                  Event Calendar
                </span>
                <Link href="/users/member/absence" className="pill-link">
                  Absence Form
                </Link>
              </div>
              <div className="flex items-center gap-3" style={{ marginTop: '20px' }}>
                <img
                  src="/nobe_logo_f.svg"
                  alt="NOBE Illinois"
                  style={{ width: "48px", height: "48px" }}
                />
                <div>
                  <p className="eyebrow" style={{ marginBottom: "2px" }}>NOBE Illinois Member Portal</p>
                  <h1 className="page-title" style={{ fontSize: "1.8rem", margin: 0 }}>
                    {member?.name ? `${member.name.split(' ')[0]}'s schedule` : 'Your event schedule'}
                  </h1>
                </div>
              </div>
              <p className="page-subtitle" style={{ marginTop: "8px" }}>View events, points, and absence forms</p>
            </div>
            <div className="action-row">
              <LogoutButton />
            </div>
          </div>
        </section>

        <div className="surface-grid auto-cards">
          <section className="panel member-summary-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Points</p>
                <h2 className="section-title">Your stats</h2>
              </div>
            </div>

            {memberLoading ? (
              <div className="subtle-card">
                <p className="section-copy">Loading stats...</p>
              </div>
            ) : member ? (
              <div className="page-stack">
                <div className="stat-card">
                  <p className="stat-label">Total points</p>
                  <p className="stat-value">{totalPoints}</p>
                </div>

                {member.strikes ? (
                  <div className="stat-card" style={{ backgroundColor: 'rgba(239, 83, 80, 0.1)', borderColor: '#EF5350' }}>
                    <p className="stat-label" style={{ color: '#D32F2F' }}>Strikes</p>
                    <p className="stat-value" style={{ color: '#D32F2F' }}>{member.strikes}</p>
                  </div>
                ) : null}

                <div className="stats-grid">
                  <div className="stat-card">
                    <p className="stat-label">Service</p>
                    <p className="stat-value">{member.service_points ?? 0}</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Professional</p>
                    <p className="stat-value">{member.professional_points ?? 0}</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Social</p>
                    <p className="stat-value">{member.social_points ?? 0}</p>
                  </div>
                </div>

                <div className="subtle-card list-stack">
                  <div className="metric-pair">
                    <span>Year</span>
                    <span>{member.year || 'N/A'}</span>
                  </div>
                  <div className="metric-pair">
                    <span>College</span>
                    <span>{member.college || 'N/A'}</span>
                  </div>
                  <div className="metric-pair">
                    <span>Committee</span>
                    <span>{member.committee || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="message-error">
                {memberError ? `Unable to load stats: ${memberError}` : `No member stats available. Auth ID: ${authId || 'Unknown'}`}
              </div>
            )}
          </section>

          <section className="panel member-upcoming-card">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Upcoming</p>
                <h2 className="section-title">Next events</h2>
              </div>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="empty-state">No upcoming events are scheduled right now.</div>
            ) : (
              <div className="list-stack">
                {upcomingEvents.map((event) => {
                  const config = EVENT_TYPE_CONFIG[event.event_type] || {
                    color: '#757575',
                    borderColor: '#616161',
                    label: event.event_type.replaceAll('_', ' '),
                  };
                  const isGCal = event.event_type === 'GOOGLE_CALENDAR';

                  const cardContent = (
                    <>
                      <div className="calendar-list-event-date">
                        <span>{formatEventDay(event.date)}</span>
                        <strong>{formatEventDayNumber(event.date)}</strong>
                      </div>
                      <div className="calendar-list-event-body" style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong>{event.name}</strong>
                          {event.event_type !== 'GOOGLE_CALENDAR' && eventConflicts.get(event.id) && (
                            <span title="Time conflict with another event" style={{ fontSize: '1.2rem' }}>⚠️</span>
                          )}
                        </div>
                        <p className="section-copy">
                          {formatEventDate(event.date)} · {event.location || 'Location TBD'}
                          {event.dresscode && ` · ${event.dresscode}`}
                        </p>
                        <p className="field-help">
                          <span style={{ color: config.borderColor, fontWeight: '600' }}>{config.label}</span>
                          {' · '}
                          {event.points} point{event.points === 1 ? '' : 's'}
                          {event.is_mandatory ? (
                            <span style={{ marginLeft: '8px', backgroundColor: '#EF5350', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: '600' }}>
                              Mandatory
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </>
                  );

                  return (
                    <div
                      key={event.id}
                      className="calendar-list-event"
                      style={{
                        borderLeftColor: config.borderColor,
                        borderLeftWidth: '4px',
                        paddingLeft: '8px',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'stretch'
                      }}
                    >


                      {isGCal ? (
                        <div style={{ display: 'flex', flex: 1, gap: '8px' }}>{cardContent}</div>
                      ) : (
                        <Link
                          href={`/users/member/event-details?eventId=${event.id}`}
                          style={{ display: 'flex', flex: 1, gap: '8px', textDecoration: 'none', color: 'inherit' }}
                        >
                          {cardContent}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: '32px' }}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Strikes</p>
                  <h2 className="section-title">Your strikes</h2>
                </div>
              </div>

              {strikes.length === 0 ? (
                <div className="empty-state">You have no active strikes.</div>
              ) : (
                <div className="list-stack">
                  {strikes.map((strike) => (
                    <div
                      key={strike.id}
                      className="subtle-card"
                      style={{
                        borderLeft: '4px solid #D32F2F',
                        backgroundColor: 'rgba(239, 83, 80, 0.06)',
                      }}
                    >
                      <p style={{ fontWeight: 700, color: '#D32F2F', marginBottom: '6px' }}>
                        {strike.reason}
                      </p>
                      <p className="section-copy">Type: {formatStrikeLabel(strike.strike_type)}</p>
                      <p className="section-copy">Source: {formatStrikeLabel(strike.source)}</p>
                      <p className="section-copy">Issued: {formatMemberStrikeDate(strike.created_at)}</p>
                      {strike.admin_note ? (
                        <p className="section-copy">Note: {strike.admin_note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="panel calendar-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Calendar</p>
              <h2 className="section-title">
                {displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </h2>
              <p className="section-copy">
                {monthEventCount === 0
                  ? 'No events scheduled this month.'
                  : `${monthEventCount} scheduled event${monthEventCount === 1 ? '' : 's'} in this month.`}
              </p>
            </div>
            <div className="action-row">
              <a href="/api/gcal-personal/auth" className="btn-secondary">
                Import Google Calendar
              </a>
              <button type="button" onClick={() => changeMonth(-1)} className="btn-secondary">
                Previous
              </button>
              <button type="button" onClick={() => setDisplayMonth(new Date())} className="btn-secondary">
                Today
              </button>
              <button type="button" onClick={() => changeMonth(1)} className="btn-secondary">
                Next
              </button>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div style={{ display: "flex", gap: "6px", background: "var(--surface-alt)", padding: "4px", borderRadius: "12px", marginBottom: "16px", maxWidth: "280px" }}>
            <button
              type="button"
              onClick={() => setViewMode("CALENDAR")}
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: "0.8rem",
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
            <button
              type="button"
              onClick={() => setViewMode("LIST")}
              style={{
                flex: 1,
                padding: "8px 12px",
                fontSize: "0.8rem",
                fontWeight: "700",
                borderRadius: "8px",
                border: "none",
                background: viewMode === "LIST" ? "white" : "transparent",
                boxShadow: viewMode === "LIST" ? "0 2px 6px rgba(0,0,0,0.05)" : "none",
                cursor: "pointer",
                color: "var(--foreground)"
              }}
            >
              📋 Clean Cards
            </button>
          </div>

          <div className="filter-section" style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontWeight: '600', fontSize: '14px', margin: 0 }}>
                Events: {selectedFilters.size}/{EVENT_TYPES.length} types
              </p>
              <button
                type="button"
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  backgroundColor: '#424242',
                  color: 'white',
                  border: '1px solid #212121',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '500',
                }}
              >
                {showFilterDropdown ? '▼ Hide Filters' : '▶ Show Filters'}
              </button>
            </div>

            {showFilterDropdown && (
              <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#ffffff', borderRadius: '4px', border: '1px solid #e0e0e0' }}>
                <div style={{ marginBottom: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={toggleAllFilters}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      backgroundColor: selectedFilters.size === EVENT_TYPES.length ? '#424242' : '#f0f0f0',
                      color: selectedFilters.size === EVENT_TYPES.length ? 'white' : '#424242',
                      border: '1px solid #e0e0e0',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '500',
                    }}
                  >
                    {selectedFilters.size === EVENT_TYPES.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                  {EVENT_TYPES.map((type) => {
                    const config = EVENT_TYPE_CONFIG[type];
                    const isSelected = selectedFilters.has(type);
                    return (
                      <label
                        key={type}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px',
                          borderRadius: '4px',
                          backgroundColor: isSelected ? '#f0f0f0' : '#ffffff',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleFilter(type)}
                          style={{
                            marginRight: '8px',
                            cursor: 'pointer',
                            width: '16px',
                            height: '16px',
                          }}
                        />
                        <span
                          style={{
                            display: 'inline-block',
                            width: '12px',
                            height: '12px',
                            backgroundColor: config.color,
                            borderRadius: '2px',
                            marginRight: '8px',
                            border: `1px solid ${config.borderColor}`,
                          }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: '500', color: '#333' }}>
                          {config.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {viewMode === "CALENDAR" ? (
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
                  const dateKey = eventDateKey(date);
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
                          dayEvents.slice(0, 3).map((event) => {
                            const config = EVENT_TYPE_CONFIG[event.event_type] || {
                              color: '#757575',
                              borderColor: '#616161',
                            };
                            const isGCal = event.event_type === 'GOOGLE_CALENDAR';

                            if (isGCal) {
                              return (
                                <div
                                  key={event.id}
                                  className="calendar-event"
                                  style={{
                                    display: 'block',
                                    borderLeftColor: config.borderColor,
                                    borderLeftWidth: '4px',
                                    paddingLeft: '8px',
                                    opacity: 0.7,
                                    backgroundColor: '#fafafa',
                                    borderRadius: '4px',
                                    padding: '8px',
                                  }}
                                >
                                  <div className="calendar-event-topline">
                                    <div className="calendar-event-time">
                                      {new Date(event.date).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                    </div>
                                  </div>
                                  <div className="calendar-event-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {event.name}
                                  </div>
                                  <div className="calendar-event-meta">
                                    <span>{event.location || 'TBD'}</span>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <Link
                                key={event.id}
                                href={`/users/member/event-details?eventId=${event.id}`}
                                className="calendar-event"
                                title={`View details for ${event.name}`}
                                style={{
                                  display: 'block',
                                  textDecoration: 'none',
                                  borderLeftColor: config.borderColor,
                                  borderLeftWidth: '4px',
                                  paddingLeft: '8px',
                                  cursor: 'pointer',
                                }}
                              >
                                <div className="calendar-event-topline">
                                  <div className="calendar-event-time">
                                    {new Date(event.date).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })}
                                  </div>
                                  {event.is_mandatory && (
                                    <span className="calendar-event-chip" style={{ backgroundColor: '#EF5350', color: 'white', fontSize: '8px', padding: '1px 6px' }}>
                                      Mandatory
                                    </span>
                                  )}
                                </div>
                                <div className="calendar-event-name" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#333' }}>
                                  {event.name}
                                  {eventConflicts.get(event.id) && (
                                    <span title="Time conflict with another event" style={{ fontSize: '0.9rem' }}>⚠️</span>
                                  )}
                                </div>
                                <div className="calendar-event-meta">
                                  <span>{event.location || 'TBD'}</span>
                                  <span>{event.points} pt</span>
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
          ) : (
            <div style={{ maxHeight: "490px", overflowY: "auto", paddingRight: "6px", marginTop: "16px" }} className="scroll-viewport-cards">
              <style jsx>{`
                .scroll-viewport-cards::-webkit-scrollbar {
                  width: 5px;
                }
                .scroll-viewport-cards::-webkit-scrollbar-track {
                  background: transparent;
                }
                .scroll-viewport-cards::-webkit-scrollbar-thumb {
                  background: var(--border);
                  border-radius: 8px;
                }
              `}</style>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px", padding: "2px" }}>
                {monthEvents.length === 0 ? (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "var(--muted)", background: "rgba(0,0,0,0.02)", borderRadius: "16px", border: "1px dashed var(--border)" }}>
                    No events scheduled for this month.
                  </div>
                ) : (
                  monthEvents.map((event) => {
                    const config = EVENT_TYPE_CONFIG[event.event_type] || {
                      color: '#757575',
                      borderColor: '#616161',
                      label: event.event_type.replaceAll('_', ' '),
                    };
                    const isGCal = event.event_type === 'GOOGLE_CALENDAR';
                    const eventDate = new Date(event.date);
                    const isUpcoming = eventDate >= new Date();

                    const cardContent = (
                      <div
                        style={{
                          padding: "20px",
                          borderRadius: "18px",
                          border: "1px solid var(--border)",
                          borderLeft: `5px solid ${config.borderColor}`,
                          background: "white",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          height: "100%",
                          position: "relative",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.01)"
                        }}
                      >
                        {/* Status Badges */}
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {isUpcoming ? (
                            <span style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "10px", background: "rgba(63,122,83,0.08)", color: "var(--success)", fontWeight: "700" }}>🟢 Upcoming</span>
                          ) : (
                            <span style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "10px", background: "rgba(107,108,112,0.06)", color: "var(--muted)", fontWeight: "700" }}>⚪ Completed</span>
                          )}
                          {event.is_mandatory && (
                            <span style={{ fontSize: "0.7rem", padding: "2px 6px", borderRadius: "10px", background: "rgba(154,59,49,0.08)", color: "var(--danger)", fontWeight: "700" }}>🔴 Mandatory</span>
                          )}
                        </div>

                        <strong style={{ fontSize: "1.05rem", color: "#111", display: "flex", alignItems: "center", gap: "6px", lineHeight: "1.3" }}>
                          {event.name}
                          {!isGCal && eventConflicts.get(event.id) && (
                            <span title="Time conflict with another event" style={{ fontSize: '1rem' }}>⚠️</span>
                          )}
                        </strong>

                        <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                          📅 {formatEventDate(event.date)}
                        </p>
                        {event.location && (
                          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>
                            📍 {event.location}
                          </p>
                        )}

                        <div style={{ marginTop: "auto", paddingTop: "10px", borderTop: "1px solid #f9f9f9", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", fontWeight: "600", color: "var(--muted)" }}>
                          <span>{config.label}</span>
                          <span>{event.points} pt{event.points === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                    );

                    if (isGCal) {
                      return <div key={event.id}>{cardContent}</div>;
                    }

                    return (
                      <Link
                        key={event.id}
                        href={`/users/member/event-details?eventId=${event.id}`}
                        style={{ textDecoration: "none", color: "inherit", display: "block" }}
                      >
                        {cardContent}
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </section>

        {events.length === 0 && (
          <div className="empty-state">No events are available for the calendar yet.</div>
        )}
      </div>
    </div>
  );
}

function formatEventDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEventDay(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '--';

  return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function formatEventDayNumber(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '--';

  return String(date.getDate());
}

function formatStrikeLabel(value: string | null) {
  if (!value) return 'Unknown';

  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatMemberStrikeDate(value: string | null) {
  if (!value) return 'Unknown date';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Unknown date';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}