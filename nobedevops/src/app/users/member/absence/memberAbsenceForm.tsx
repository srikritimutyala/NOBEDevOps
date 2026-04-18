'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export default function AbsencePage() {
    const supabase = createClient();
    const [formData, setFormData] = useState({
        eventMissed: '',
        reason: '',
    });
    const [submitted, setSubmitted] = useState(false);
    const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
    const [absencesLoading, setAbsencesLoading] = useState(true);
    const [absencesError, setAbsencesError] = useState<string | null>(null);

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
    }, []);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const pathname = usePathname();
    const currentPath = pathname?.replace(/\/$/, '') || '';

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

        const { data, error } = await supabase
            .from('excused_absences')
            .insert([
                {
                    user_id: user.id,
                    reason: `${formData.eventMissed ? `Event: ${formData.eventMissed} — ` : ''}${formData.reason}`,
                    submitted_at: new Date().toISOString(),
                    status: 'PENDING',
                },
            ]);

        if (error) {
            console.error('Insert error:', error);
            return;
        }

        // Send email notification
        try {
            await fetch('/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: 'vinaysanjeev77@gmail.com',
                    subject: 'New Absence Form Submission',
                    message: `An absence form has been submitted.\n\nEvent Missed: ${formData.eventMissed}\n\nReason: ${formData.reason}`,
                }),
            });
        } catch (emailError) {
            console.error('Email send error:', emailError);
        }

        setSubmitted(true);
        setFormData({ eventMissed: '', reason: '' });
        setTimeout(() => setSubmitted(false), 3000);
        await fetchAbsences();
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-8">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8 rounded-3xl border border-white/10 bg-slate-900/80 p-6">
                    <div className="inline-flex overflow-hidden rounded-full border border-white/10 bg-slate-800">
                        <Link
                            href="/users/member"
                            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-700"
                        >
                            Event Calendar
                        </Link>
                        <span
                            className={`rounded-full px-4 py-2 text-sm font-semibold ${currentPath === '/users/member/absence' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                        >
                            Absence Form
                        </span>
                    </div>
                    <h1 className="mt-6 text-4xl font-bold">Absence Form</h1>
                    <p className="mt-2 text-slate-400">Submit a request and review your excused absences.</p>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <section className="rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-xl">
                        <h2 className="text-2xl font-semibold mb-6">Submit absence</h2>

                        {submitted && (
                            <div className="mb-6 rounded-2xl bg-emerald-600/10 px-4 py-3 text-emerald-200 ring-1 ring-emerald-500/20">
                                Absence form submitted successfully!
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label htmlFor="eventMissed" className="block text-sm font-medium text-slate-300 mb-2">
                                    Event Missed
                                </label>
                                <input
                                    type="text"
                                    id="eventMissed"
                                    name="eventMissed"
                                    value={formData.eventMissed}
                                    onChange={handleChange}
                                    required
                                    placeholder="e.g., Team Meeting, Project Deadline"
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>

                            <div>
                                <label htmlFor="reason" className="block text-sm font-medium text-slate-300 mb-2">
                                    Reason for Absence
                                </label>
                                <textarea
                                    id="reason"
                                    name="reason"
                                    value={formData.reason}
                                    onChange={handleChange}
                                    required
                                    placeholder="Please provide details..."
                                    rows={6}
                                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
                            >
                                Submit Absence
                            </button>
                        </form>
                    </section>

                    <aside className="rounded-3xl border border-white/10 bg-slate-900 p-8 shadow-xl">
                        <h2 className="text-2xl font-semibold mb-6">Your excused absences</h2>

                        {absencesLoading ? (
                            <div className="rounded-2xl bg-slate-950 p-6 text-slate-400">Loading your absences...</div>
                        ) : absencesError ? (
                            <div className="rounded-2xl bg-slate-950 p-6 text-rose-300">{absencesError}</div>
                        ) : absences.length === 0 ? (
                            <div className="rounded-2xl bg-slate-950 p-6 text-slate-400">No excused absences have been submitted yet.</div>
                        ) : (
                            <div className="space-y-4">
                                {absences.map((absence) => (
                                    <div key={absence.id} className="rounded-3xl border border-slate-800 bg-slate-950 p-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-sm text-slate-400">Status</p>
                                                <p className="mt-1 text-base font-semibold text-white">{absence.status || 'PENDING'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm text-slate-400">Submitted</p>
                                                <p className="mt-1 text-base font-semibold text-white">
                                                    {absence.submitted_at ? new Date(absence.submitted_at).toLocaleDateString() : 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-4 rounded-2xl bg-slate-950/80 p-4 text-sm leading-6 text-slate-300">
                                            {absence.reason || 'No reason provided.'}
                                        </div>
                                        {absence.reviewed_at && (
                                            <p className="mt-4 text-sm text-slate-500">
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
