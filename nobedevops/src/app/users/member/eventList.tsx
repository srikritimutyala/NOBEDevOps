'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CSSProperties, useEffect, useMemo, useState } from 'react';
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
    check_in_start?: string;
    check_in_end?: string;
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

    const [displayMonth, setDisplayMonth] = useState(new Date());

    const pathname = usePathname();
    const currentPath = pathname?.replace(/\/$/, '') || '';

    const eventDateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
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

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();

    const isSameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();

    const changeMonth = (offset: number) => {
        setDisplayMonth((current) => {
            const next = new Date(current.getFullYear(), current.getMonth() + offset, 1);
            return next;
        });
    };

    const EventBadge = ({ event }: { event: Event }) => (
        <div style={styles.calendarEvent} title={event.name}>
            <div style={styles.calendarEventTime}>{new Date(event.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
            <div style={styles.calendarEventName}>{event.name}</div>
        </div>
    );

    if (loading) return <div style={{ padding: '24px', color: '#ffffff' }}>Loading events...</div>;
    if (error) return <div style={{ padding: '24px', color: '#ff9b71' }}>Error: {error}</div>;

    return (
        <div style={styles.page}>
            <div style={styles.container}>
                <div style={styles.headerCard}>
                    <div style={styles.pageHeader}>
                        <div>
                            <div style={styles.tabBar}>
                                <div className="inline-flex overflow-hidden rounded-full border border-white/10 bg-slate-800">
                                <span
                                    className={`rounded-full px-4 py-2 text-sm font-semibold ${currentPath === '/users/member' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                                >
                                    Event Calendar
                                </span>
                                <Link
                                    href="/users/member/absence"
                                    className="rounded-full px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700"
                                >
                                    Absence Form
                                </Link>
                            </div>
                            </div>
                            <h1 style={styles.title}>Member Dashboard</h1>
                            <p style={styles.subtitle}>Your member calendar and points summary</p>
                        </div>
                        <div style={styles.logoutPanel}>
                            <LogoutButton />
                        </div>
                    </div>
                </div>

                <div style={styles.topPanels}>
                <section style={styles.largePanel}>
                    <div style={styles.calendarHeaderContainer}>
                        <div>
                            <p style={styles.calendarSubLabel}>Current month</p>
                            <h2 style={styles.calendarTitle}>{displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
                        </div>
                        <div style={styles.calendarButtons}>
                            <button type="button" onClick={() => changeMonth(-1)} style={styles.calendarActionButton}>
                                Previous
                            </button>
                            <button type="button" onClick={() => changeMonth(1)} style={styles.calendarActionButton}>
                                Next
                            </button>
                        </div>
                    </div>

                    <div style={styles.calendarHeaderRow}>
                        {weekDays.map((day) => (
                            <div key={day} style={styles.calendarHeaderCell}>
                                {day}
                            </div>
                        ))}
                    </div>

                    <div style={styles.calendarGrid}>
                        {calendarDays.map((date) => {
                            const inMonth = date.getMonth() === displayMonth.getMonth();
                            const dateKey = eventDateKey(date);
                            const dayEvents = eventsByDate[dateKey] || [];
                            const isToday = isSameDay(date, today);

                            return (
                                <div
                                    key={date.toISOString()}
                                    style={{
                                        ...styles.calendarCell,
                                        ...(inMonth ? {} : styles.calendarCellInactive),
                                        ...(isToday ? styles.calendarCellToday : {}),
                                    }}
                                >
                                    <div style={styles.dayNumberRow}>
                                        <span style={styles.dayNumber}>{date.getDate()}</span>
                                        {isToday && <span style={styles.todayBadge}>Today</span>}
                                    </div>
                                    <div style={styles.dayEvents}>
                                        {dayEvents.slice(0, 3).map((event) => (
                                            <EventBadge key={event.id} event={event} />
                                        ))}
                                        {dayEvents.length > 3 && (
                                            <div style={styles.moreEventsText}>+{dayEvents.length - 3} more</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                <aside style={styles.largePanel}>
                    <div style={styles.statsHeader}>
                        <p style={styles.statsLabel}>Member points</p>
                        <h2 style={styles.statsTitle}>Your stats</h2>
                    </div>

                    {memberLoading ? (
                        <div style={styles.infoBox}>Loading stats…</div>
                    ) : member ? (
                        <div style={styles.statsGroup}>
                            <div style={styles.summaryCard}>
                                <h3 style={styles.summaryTitle}>Total points</h3>
                                <p style={styles.summaryValue}>{(member.social_points ?? 0) + (member.professional_points ?? 0) + (member.service_points ?? 0)}</p>
                            </div>
                            <div style={styles.pointsGrid}>
                                <div style={styles.pointCard}>
                                    <p style={styles.pointLabel}>Service points</p>
                                    <p style={styles.pointValue}>{member.service_points ?? 0}</p>
                                </div>
                                <div style={styles.pointCard}>
                                    <p style={styles.pointLabel}>Professional points</p>
                                    <p style={styles.pointValue}>{member.professional_points ?? 0}</p>
                                </div>
                                <div style={styles.pointCard}>
                                    <p style={styles.pointLabel}>Social points</p>
                                    <p style={styles.pointValue}>{member.social_points ?? 0}</p>
                                </div>
                            </div>
                            <div style={styles.profileCard}>
                                <p style={styles.profileLabel}>Year</p>
                                <p style={styles.profileValue}>{member.year || 'N/A'}</p>
                                <p style={styles.profileLabel}>College</p>
                                <p style={styles.profileValue}>{member.college || 'N/A'}</p>
                                <p style={styles.profileLabel}>Committee</p>
                                <p style={styles.profileValue}>{member.committee || 'N/A'}</p>
                            </div>
                        </div>
                    ) : (
                        <div style={styles.infoBox}>
                            {memberError ? `Unable to load stats: ${memberError}` : `No member stats available. Auth ID: ${authId || 'Unknown'}`}
                        </div>
                    )}
                </aside>
            </div>

            {events.length === 0 && (
                <div style={styles.emptyState}>
                    No events available for the calendar yet.
                </div>
            )}
        </div>
    </div>
    );
}

const styles: { [key: string]: CSSProperties } = {
    page: {
        minHeight: '100vh',
        background: '#020617',
        color: '#e2e8f0',
        padding: '32px 24px',
        fontFamily: 'Inter, Arial, sans-serif',
    },
    container: {
        maxWidth: '1200px',
        margin: '0 auto',
    },
    headerCard: {
        background: 'rgba(15, 23, 42, 0.8)',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        borderRadius: '28px',
        padding: '28px',
        marginBottom: '28px',
        boxShadow: '0 20px 60px rgba(15, 23, 42, 0.35)',
    },
    pageHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
    },
    tabBar: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0px',
        marginBottom: '16px',
        flexWrap: 'wrap',
        overflow: 'hidden',
        borderRadius: '999px',
        background: '#1e293b',
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    tabButton: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40px',
        padding: '10px 18px',
        borderRadius: '999px',
        border: 'none',
        background: 'transparent',
        color: '#cbd5e1',
        fontSize: '14px',
        fontWeight: 700,
        textDecoration: 'none',
        cursor: 'pointer',
    },
    tabButtonActive: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '40px',
        padding: '10px 18px',
        borderRadius: '999px',
        border: 'none',
        background: '#0ea5e9',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: 700,
    },
    title: {
        fontSize: '42px',
        fontWeight: 800,
        margin: 0,
        letterSpacing: '-1px',
    },
    subtitle: {
        color: '#cbd5e1',
        fontSize: '16px',
        marginTop: '10px',
    },
    logoutPanel: {
        border: '1px solid rgba(148, 163, 184, 0.18)',
        borderRadius: '18px',
        padding: '16px',
        background: '#0f172a',
    },
    topPanels: {
        display: 'grid',
        gridTemplateColumns: '1.3fr 0.9fr',
        gap: '22px',
    },
    largePanel: {
        background: '#0f172a',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        borderRadius: '28px',
        padding: '24px',
        boxShadow: '0 20px 50px rgba(15, 23, 42, 0.22)',
    },
    panelTitle: {
        fontSize: '28px',
        fontWeight: 700,
        marginBottom: '8px',
    },
    panelText: {
        fontSize: '16px',
        color: '#a3a3a3',
        lineHeight: 1.5,
        marginBottom: '20px',
    },
    calendarHeaderContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '20px',
    },
    calendarSubLabel: {
        color: '#7c7c7c',
        fontSize: '14px',
        marginBottom: '6px',
    },
    calendarTitle: {
        fontSize: '26px',
        fontWeight: 700,
        color: '#ffffff',
        margin: 0,
    },
    calendarButtons: {
        display: 'flex',
        gap: '10px',
    },
    calendarActionButton: {
        background: '#0b5cff',
        color: '#ffffff',
        border: '1px solid #0a4ad1',
        borderRadius: '12px',
        padding: '10px 18px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 700,
        transition: 'background 120ms ease-in-out, transform 120ms ease-in-out',
    },
    calendarActionButtonHover: {
        background: '#0948d4',
    },
    calendarToolbar: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        gap: '12px',
    },
    monthButton: {
        background: '#151515',
        color: '#ffffff',
        border: '1px solid #2f2f2f',
        borderRadius: '10px',
        padding: '8px 14px',
        cursor: 'pointer',
        fontSize: '16px',
        fontWeight: 700,
    },
    monthLabel: {
        fontSize: '18px',
        fontWeight: 700,
        color: '#f5f5f5',
    },
    calendarBox: {
        background: '#111111',
        borderRadius: '14px',
        overflow: 'hidden',
        border: '1px solid #2b2b2b',
    },
    calendarHeaderRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        background: '#0f172a',
        borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
    },
    calendarHeaderCell: {
        padding: '12px 8px',
        textAlign: 'center',
        fontWeight: 600,
        color: '#bdbdbd',
        fontSize: '14px',
    },
    calendarGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
    },
    calendarCell: {
        minHeight: '140px',
        borderRight: '1px solid rgba(148, 163, 184, 0.08)',
        borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
        background: '#0b1226',
        padding: '10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        overflow: 'hidden',
    },
    calendarCellInactive: {
        background: '#08101e',
    },
    calendarCellToday: {
        boxShadow: 'inset 0 0 0 1px rgba(59, 130, 246, 0.8)',
    },
    dayNumberRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px',
    },
    dayNumber: {
        fontSize: '13px',
        fontWeight: 700,
        color: '#d4d4d4',
    },
    todayBadge: {
        background: '#14213d',
        color: '#ffffff',
        borderRadius: '999px',
        padding: '4px 10px',
        fontSize: '11px',
        fontWeight: 700,
    },
    dayEvents: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: '100%',
        overflow: 'hidden',
    },
    calendarEvent: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        width: '100%',
        minHeight: '44px',
        background: '#112240',
        border: '1px solid rgba(59, 130, 246, 0.15)',
        borderRadius: '12px',
        padding: '8px 10px',
        color: '#ffffff',
        fontSize: '12px',
        lineHeight: 1.2,
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
    },
    calendarEventTime: {
        display: 'block',
        color: '#c7c7c7',
        fontWeight: 600,
        marginBottom: '2px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    calendarEventName: {
        display: 'block',
        width: '100%',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    moreEventsText: {
        fontSize: '11px',
        color: '#9d9d9d',
        fontWeight: 600,
        paddingTop: '2px',
    },
    selectedEventLayout: {
        display: 'grid',
        gap: '16px',
    },
    selectedEventSideCard: {
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: '18px',
        padding: '22px',
    },
    statsHeader: {
        marginBottom: '24px',
    },
    statsLabel: {
        color: '#a3a3a3',
        fontSize: '14px',
        fontWeight: 600,
        marginBottom: '8px',
        display: 'block',
    },
    statsTitle: {
        fontSize: '28px',
        fontWeight: 700,
        margin: 0,
    },
    infoBox: {
        background: '#020617',
        border: '1px solid #2a2a2a',
        borderRadius: '18px',
        padding: '22px',
        color: '#b3b3b3',
    },
    statsGroup: {
        display: 'grid',
        gap: '16px',
    },
    summaryCard: {
        background: '#0f172a',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        borderRadius: '22px',
        padding: '22px',
    },
    summaryTitle: {
        fontSize: '16px',
        fontWeight: 600,
        color: '#a3a3a3',
        margin: 0,
    },
    summaryValue: {
        marginTop: '12px',
        fontSize: '42px',
        fontWeight: 800,
        color: '#ffffff',
    },
    pointsGrid: {
        display: 'grid',
        gap: '16px',
    },
    pointCard: {
        background: '#0f172a',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        borderRadius: '18px',
        padding: '18px',
    },
    pointLabel: {
        fontSize: '13px',
        color: '#9d9d9d',
        margin: 0,
    },
    pointValue: {
        marginTop: '10px',
        fontSize: '30px',
        fontWeight: 700,
        color: '#ffffff',
    },
    profileCard: {
        background: '#0f172a',
        border: '1px solid rgba(148, 163, 184, 0.12)',
        borderRadius: '18px',
        padding: '18px',
        display: 'grid',
        gap: '12px',
    },
    profileLabel: {
        fontSize: '13px',
        color: '#9d9d9d',
        margin: 0,
    },
    profileValue: {
        fontSize: '15px',
        color: '#ffffff',
        fontWeight: 700,
        margin: 0,
    },
    emptyState: {
        marginTop: '32px',
        background: '#101010',
        border: '1px dashed #444',
        borderRadius: '18px',
        padding: '28px',
        textAlign: 'center',
        color: '#a3a3a3',
    },
};
