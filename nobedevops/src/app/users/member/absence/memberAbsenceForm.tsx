'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '../../../utils/supabase/client';

interface AbsenceRecord {
    id: string;
    event_id: string | null;
    reason: string | null;
    submitted_at: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    status: string | null;
}

interface Event {
    id: string;
    name: string;
    date: string;
}

export default function AbsencePage() {
    const supabase = createClient();

    const [formData, setFormData] = useState({
        eventId: '',
        reason: '',
    });

    const [submitted, setSubmitted] = useState(false);
    const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
    const [absencesLoading, setAbsencesLoading] = useState(true);
    const [absencesError, setAbsencesError] = useState<string | null>(null);
    const [events, setEvents] = useState<Event[]>([]);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [imageFile, setImageFile] = useState<File | null>(null);

    const pathname = usePathname();
    const currentPath = pathname?.replace(/\/$/, '') || '';
    const searchParams = useSearchParams();

    const eventsMap = Object.fromEntries(events.map((e) => [e.id, e]));

    const fetchAbsences = async () => {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setAbsencesError(userError?.message || 'Unable to load absences');
            setAbsences([]);
            setAbsencesLoading(false);
            return;
        }

        const { data, error } = await supabase
            .from('excused_absences')
            .select('id, event_id, reason, submitted_at, reviewed_by, reviewed_at, status')
            .eq('user_id', user.id)
            .order('submitted_at', { ascending: false });

        if (error) {
            setAbsencesError(error.message);
            setAbsences([]);
        } else {
            setAbsences(data || []);
            setAbsencesError(null);
        }

        setAbsencesLoading(false);
    };

    useEffect(() => {
        fetchAbsences();

        const fetchEvents = async () => {
            const { data } = await supabase
                .from('events')
                .select('id, name, date')
                .order('date', { ascending: false });

            setEvents(data || []);
            setEventsLoading(false);
        };

        fetchEvents();
    }, []);

    useEffect(() => {
        const eventId = searchParams.get('eventId');

        if (eventId) {
            setFormData((prev) => ({ ...prev, eventId }));
        }
    }, [searchParams]);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        const { name, value } = e.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            console.error('User not logged in:', { userError, user });
            alert('You must be logged in to submit an absence form');
            return;
        }

        const selectedEvent = eventsMap[formData.eventId];

        let imageUrl: string | null = null;

        if (imageFile) {
            const filePath = `${user.id}/${Date.now()}-${imageFile.name}`;

            const { error: uploadError } = await supabase.storage
                .from('absence-images')
                .upload(filePath, imageFile);

            if (uploadError) {
                console.error('Image upload error:', uploadError);
                alert(`Image upload failed: ${uploadError.message}`);
                return;
            }

            const { data } = supabase.storage
                .from('absence-images')
                .getPublicUrl(filePath);

            imageUrl = data.publicUrl;
        }

        const { error } = await supabase
            .from('excused_absences')
            .insert([
                {
                    user_id: user.id,
                    event_id: formData.eventId || null,
                    reason: formData.reason,
                    submitted_at: new Date().toISOString(),
                    status: 'PENDING',
                    image_url: imageUrl,
                },
            ]);

        if (error) {
            console.error('Insert error:', error);
            return;
        }

        try {
            await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: 'vinaysanjeev77@gmail.com',
                    subject: 'New Absence Form Submission',
                    message: `An absence form has been submitted.\n\nEvent Missed: ${selectedEvent?.name ?? 'Unknown'}\n\nReason: ${formData.reason}`,
                }),
            });
        } catch (emailError) {
            console.error('Email send error:', emailError);
        }

        setSubmitted(true);
        setFormData({ eventId: '', reason: '' });
        setImageFile(null);
        setTimeout(() => setSubmitted(false), 3000);
        await fetchAbsences();
    };

    return (
        <div className="app-shell">
            <div className="page-frame page-stack">
                <section className="hero-card">
                    <div className="pill-nav">
                        <Link href="/users/member" className="pill-link">
                            Event Calendar
                        </Link>

                        <span className={currentPath === '/users/member/absence' ? 'pill-link-active' : 'pill-link'}>
                            Absence Form
                        </span>
                    </div>

                    <p className="eyebrow" style={{ marginTop: '20px' }}>
                        Member
                    </p>

                    <h1 className="page-title">Absence requests</h1>
                    <p className="page-subtitle">Submit a request and review your excused absences.</p>
                </section>

                <div className="surface-grid two-up">
                    <section className="panel">
                        <div className="panel-header">
                            <div>
                                <p className="eyebrow">Submit</p>
                                <h2 className="section-title">Submit absence</h2>
                            </div>
                        </div>

                        {submitted && (
                            <div className="message-success" style={{ marginBottom: '24px' }}>
                                Absence form submitted successfully!
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="field-group">
                            <div className="field-group">
                                <label htmlFor="eventId" className="field-label">
                                    Event missed
                                </label>

                                <select
                                    id="eventId"
                                    name="eventId"
                                    value={formData.eventId}
                                    onChange={handleChange}
                                    required
                                    className="field-select"
                                    disabled={eventsLoading}
                                >
                                    <option value="">
                                        {eventsLoading ? 'Loading events...' : 'Select an event'}
                                    </option>

                                    {events.map((event) => (
                                        <option key={event.id} value={event.id}>
                                            {event.name} — {new Date(event.date).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric',
                                            })}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="field-group">
                                <label htmlFor="reason" className="field-label">
                                    Reason for absence
                                </label>

                                <textarea
                                    id="reason"
                                    name="reason"
                                    value={formData.reason}
                                    onChange={handleChange}
                                    required
                                    placeholder="Please provide details..."
                                    rows={6}
                                    className="field-textarea"
                                />

                                <div style={{ marginTop: '10px' }}>
                                    <input
                                        id="image"
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                                        hidden
                                    />

                                    <label
                                        htmlFor="image"
                                        title="Upload image"
                                        style={{
                                            cursor: "pointer",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "8px",
                                        }}
                                    >
                                        <img
                                            src="/upload-icon.png"
                                            alt="Upload"
                                            style={{
                                                width: "24px",
                                                height: "24px",
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>

                            {imageFile && (
                                <div className="subtle-card" style={{ marginBottom: '4px' }}>
                                    <p className="eyebrow" style={{ marginBottom: '6px' }}>
                                        Uploaded image
                                    </p>

                                    <p className="section-copy" style={{ margin: 0 }}>
                                        {imageFile.name}
                                    </p>

                                    <button
                                        type="button"
                                        onClick={() => setImageFile(null)}
                                        className="field-help"
                                        style={{
                                            marginTop: '10px',
                                            border: 'none',
                                            background: 'transparent',
                                            padding: 0,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Remove image
                                    </button>
                                </div>
                            )}

                            <button type="submit" className="btn button-full">
                                Submit Absence
                            </button>
                        </form>
                    </section>

                    <aside className="panel">
                        <div className="panel-header">
                            <div>
                                <p className="eyebrow">History</p>
                                <h2 className="section-title">Your excused absences</h2>
                            </div>
                        </div>

                        {absencesLoading ? (
                            <div className="subtle-card">
                                <p className="section-copy">Loading your absences...</p>
                            </div>
                        ) : absencesError ? (
                            <div className="message-error">{absencesError}</div>
                        ) : absences.length === 0 ? (
                            <div className="empty-state">No excused absences have been submitted yet.</div>
                        ) : (
                            <div className="list-stack">
                                {absences.map((absence) => (
                                    <div key={absence.id} className="subtle-card">
                                        <div className="panel-header" style={{ marginBottom: '16px' }}>
                                            <div>
                                                <p className="eyebrow" style={{ marginBottom: '4px' }}>
                                                    Status
                                                </p>
                                                <p>
                                                    <strong>{absence.status || 'PENDING'}</strong>
                                                </p>
                                            </div>

                                            <div style={{ textAlign: 'right' }}>
                                                <p className="eyebrow" style={{ marginBottom: '4px' }}>
                                                    Submitted
                                                </p>
                                                <p>
                                                    <strong>
                                                        {absence.submitted_at
                                                            ? new Date(absence.submitted_at).toLocaleDateString()
                                                            : 'N/A'}
                                                    </strong>
                                                </p>
                                            </div>
                                        </div>

                                        {absence.event_id && eventsMap[absence.event_id] && (
                                            <p className="field-label" style={{ marginBottom: '8px' }}>
                                                {eventsMap[absence.event_id].name} —{' '}
                                                {new Date(eventsMap[absence.event_id].date).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                })}
                                            </p>
                                        )}

                                        <div className="message">
                                            {absence.reason || 'No reason provided.'}
                                        </div>

                                        {absence.reviewed_at && (
                                            <p className="field-help" style={{ marginTop: '14px' }}>
                                                Reviewed on {new Date(absence.reviewed_at).toLocaleDateString()}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}