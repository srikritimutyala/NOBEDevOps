'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AbsencePage() {
    const [formData, setFormData] = useState({
        eventMissed: '',
        reason: '',
    });
    const [submitted, setSubmitted] = useState(false);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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
            console.error('User not logged in');
            return;
        }

        const { data, error } = await supabase
            .from('excused_absences')
            .insert([
                {
                    user_id: user.id,
                    reason: formData.reason,
                    submitted_at: new Date().toISOString(),
                    status: 'PENDING',
                },
            ]);

        if (error) {
            console.error('Insert error:', error);
            return;
        }

        setSubmitted(true);
        setFormData({ eventMissed: '', reason: '' });
        setTimeout(() => setSubmitted(false), 3000);
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-2xl mx-auto bg-white rounded-lg shadow p-8">
                <h1 className="text-3xl font-bold mb-6">Absence Form</h1>

                {submitted && (
                    <div className="mb-4 p-4 bg-green-100 text-green-700 rounded">
                        Absence form submitted successfully!
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label
                            htmlFor="eventMissed"
                            className="block text-sm font-medium text-gray-700 mb-2"
                        >
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
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="reason"
                            className="block text-sm font-medium text-gray-700 mb-2"
                        >
                            Reason for Absence
                        </label>
                        <textarea
                            id="reason"
                            name="reason"
                            value={formData.reason}
                            onChange={handleChange}
                            required
                            placeholder="Please provide details..."
                            rows={4}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition"
                    >
                        Submit Absence
                    </button>
                </form>
            </div>
        </div>
    );
}