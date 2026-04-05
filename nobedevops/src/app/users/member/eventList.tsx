'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import LogoutButton from "../login/logout"


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

export default function EventList() {
    const router = useRouter();
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    const [displayMonth, setDisplayMonth] = useState(new Date());

    const eventDateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const eventsByDate = events.reduce<Record<string, Event[]>>((acc, event) => {
        const eventDate = new Date(event.date);
        const key = eventDateKey(eventDate);
        if (!acc[key]) acc[key] = [];
        acc[key].push(event);
        return acc;
    }, {});

    const monthStart = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
    const monthEnd = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0);
    const firstDayOfCalendar = new Date(monthStart);
    firstDayOfCalendar.setDate(monthStart.getDate() - monthStart.getDay());

    const calendarDays = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(firstDayOfCalendar);
        date.setDate(firstDayOfCalendar.getDate() + index);
        return date;
    });

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
        <Link href="/users/member/absence" className="block rounded-md bg-sky-100 text-sky-900 px-2 py-1 text-xs font-medium hover:bg-sky-200">
            {event.name}
        </Link>
    );

    if (loading) return <div className="p-4">Loading events...</div>;
    if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Events</h1>
                    <p className="text-sm text-gray-600">Browse events</p>
                </div>
                <div className="rounded-lg border border-black/10 dark:border-white/20 p-4">
                    <LogoutButton />
                </div>
            </div>

            <div className="rounded-3xl border border-black/10 bg-white shadow-sm p-4">
                <div className="mb-4 flex items-center justify-between gap-3 px-2 md:px-4">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Current month</p>
                        <h2 className="text-2xl font-semibold">{displayMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => changeMonth(-1)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            onClick={() => changeMonth(1)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            Next
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-1 px-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 md:px-4">
                    {weekDays.map((day) => (
                        <div key={day} className="py-2">
                            {day}
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1 px-2 md:px-4">
                    {calendarDays.map((date) => {
                        const inMonth = date.getMonth() === displayMonth.getMonth();
                        const dateKey = eventDateKey(date);
                        const dayEvents = eventsByDate[dateKey] || [];
                        const isToday = isSameDay(date, today);

                        return (
                            <div
                                key={date.toISOString()}
                                className={`min-h-[120px] overflow-hidden rounded-2xl border p-2 transition ${
                                    inMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'
                                } ${isToday ? 'border-sky-500 shadow-sm' : 'border-gray-200'}`}
                            >
                                <div className="mb-2 flex items-center justify-between">
                                    <span className="text-sm font-semibold">{date.getDate()}</span>
                                    {isToday && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Today</span>}
                                </div>
                                <div className="space-y-1">
                                    {dayEvents.slice(0, 2).map((event) => (
                                        <EventBadge key={event.id} event={event} />
                                    ))}
                                    {dayEvents.length > 2 && (
                                        <div className="text-xs text-gray-500">+{dayEvents.length - 2} more</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {events.length === 0 && (
                <div className="mt-8 rounded-3xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-600">
                    No events available for the calendar yet.
                </div>
            )}
        </div>
    );
}