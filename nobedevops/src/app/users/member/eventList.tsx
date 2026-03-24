'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

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

    const upcomingEvents = events.filter(
        (e) => new Date(e.date) > new Date()
    );
    const pastEvents = events.filter(
        (e) => new Date(e.date) <= new Date()
    );

    const EventCard = ({ event }: { event: Event }) => (
        <Link href={`/users/member/absence`}>
            <div className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h3 className="font-semibold text-lg">{event.name}</h3>
                        <span className="text-sm text-gray-600">{event.event_type}</span>
                    </div>
                    <div className="text-right">
                        <span className="text-lg font-bold text-blue-600">{event.points} pts</span>
                        {event.is_mandatory && (
                            <div className="text-xs bg-red-100 text-red-800 rounded px-2 py-1 mt-1">
                                Mandatory
                            </div>
                        )}
                    </div>
                </div>
                <div className="space-y-1 text-sm text-gray-700">
                    <p>📅 {new Date(event.date).toLocaleString()}</p>
                    {event.location && <p>📍 {event.location}</p>}
                </div>
            </div>
        </Link>
    );

    if (loading) return <div className="p-4">Loading events...</div>;
    if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Events</h1>

            {upcomingEvents.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        {upcomingEvents.map((event) => (
                            <EventCard key={event.id} event={event} />
                        ))}
                    </div>
                </section>
            )}

            {pastEvents.length > 0 && (
                <section>
                    <h2 className="text-2xl font-semibold mb-4">Past Events</h2>
                    <div className="grid gap-4 md:grid-cols-2 opacity-75">
                        {pastEvents.map((event) => (
                            <EventCard key={event.id} event={event} />
                        ))}
                    </div>
                </section>
            )}

            {events.length === 0 && (
                <div className="text-center text-gray-600">
                    <p>No events available.</p>
                </div>
            )}
        </div>
    );
}