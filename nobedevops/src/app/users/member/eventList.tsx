'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../authprovider';
import LogoutButton from '../login/logout';

interface Event {
  id: string;
  name: string;
  event_type: string;
  date: string;
  points: number;
  is_mandatory: boolean;
  location?: string;
}

interface MemberProfile {
  name: string | null;
  year: string | null;
  college: string | null;
  committee: string | null;
  social_points: number | null;
  professional_points: number | null;
  service_points: number | null;
}

export default function EventList() {
  const { session } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [authId, setAuthId] = useState<string | null>(null);
  const [displayMonth, setDisplayMonth] = useState(new Date());

  const pathname = usePathname();
  const currentPath = pathname?.replace(/\/$/, '') || '';

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
        setEvents(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch events');
      } finally {
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
        .select('name, year, college, committee, social_points, professional_points, service_points')
        .eq('auth_id', session.user.id)
        .single();

      if (fetchError) {
        setMemberError(fetchError.message);
        setMember(null);
      } else {
        setMember(data as MemberProfile);
      }

      setMemberLoading(false);
    };

    if (session) {
      fetchMember();
    }
  }, [session]);

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
              {/* <img src="/nobe_logo_f.svg" alt="NOBE Illinois" width={140} height={140} style={{ marginBottom: '12px' }} /> */}
              <div className="pill-nav">
                <span className={currentPath === '/users/member' ? 'pill-link-active' : 'pill-link'}>
                  Event Calendar
                </span>
                <Link href="/users/member/absence" className="pill-link">
                  Absence Form
                </Link>
              </div>
              <p className="eyebrow" style={{ marginTop: '20px' }}>Member</p>
              <h1 className="page-title">
                {member?.name ? `${member.name.split(' ')[0]}'s schedule` : 'Your event schedule'}
              </h1>
              <p className="page-subtitle">
                View events and points
              </p>
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
                {upcomingEvents.map((event) => (
                  <div key={event.id} className="calendar-list-event">
                    <div className="calendar-list-event-date">
                      <span>{formatEventDay(event.date)}</span>
                      <strong>{formatEventDayNumber(event.date)}</strong>
                    </div>
                    <div className="calendar-list-event-body">
                      <strong>{event.name}</strong>
                      <p className="section-copy">
                        {formatEventDate(event.date)} · {event.location || 'Location TBD'}
                      </p>
                      <p className="field-help">
                        {event.event_type.replaceAll('_', ' ')} · {event.points} point{event.points === 1 ? '' : 's'}
                        {event.is_mandatory ? ' · Mandatory' : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                const isToday = isSameDay(date, today);

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
                        <p className="calendar-empty-copy">
                          {inMonth ? 'Open day' : ''}
                        </p>
                      ) : (
                        dayEvents.slice(0, 3).map((event) => (
                          <Link
                            key={event.id}
                            href={`/users/member/absence?eventId=${event.id}`}
                            className="calendar-event"
                            title={`Request absence for ${event.name}`}
                            style={{ display: 'block', textDecoration: 'none' }}
                          >
                            <div className="calendar-event-topline">
                              <div className="calendar-event-time">
                                {new Date(event.date).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </div>
                              {event.is_mandatory ? (
                                <span className="calendar-event-chip">Mandatory</span>
                              ) : null}
                            </div>
                            <div className="calendar-event-name">{event.name}</div>
                            <div className="calendar-event-meta">
                              <span>{event.location || 'TBD'}</span>
                              <span>{event.points} pt</span>
                            </div>
                          </Link>
                        ))
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

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEventDay(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

function formatEventDayNumber(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return String(date.getDate());
}
