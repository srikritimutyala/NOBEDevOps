"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import QRCode from "react-qr-code";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

function InviteMember() {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState<{ email: string; tempPassword?: string; emailSent: boolean } | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setResult(null);
    setInviting(true);

    const res = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    });

    const data = await res.json();
    if (!res.ok) {
      setInviteError(data.error ?? 'Something went wrong.');
    } else {
      setResult({
        email: inviteEmail,
        tempPassword: data.tempPassword,
        emailSent: data.tempPassword === undefined,
      });
      setInviteEmail('');
    }
    setInviting(false);
  }

  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2>Invite Member</h2>
      <form onSubmit={handleInvite} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <div>
          <label>Illinois Email</label><br />
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="netid@illinois.edu"
            required
          />
        </div>
        <button type="submit" disabled={inviting}>
          {inviting ? 'Sending...' : 'Send invite'}
        </button>
      </form>
      {inviteError && <p style={{ color: 'red' }}>{inviteError}</p>}
      {result && result.emailSent && (
        <p style={{ color: 'green' }}>Invite email sent to {result.email}.</p>
      )}
      {result && result.tempPassword && (
        <div style={{ marginTop: '8px', padding: '12px', background: '#fffbe6', border: '1px solid #f0c040', borderRadius: '6px' }}>
          <p style={{ margin: '0 0 6px', fontWeight: 'bold' }}>Account created. Share these credentials with {result.email}:</p>
          <p style={{ margin: '0 0 4px' }}>Email: <code>{result.email}</code></p>
          <p style={{ margin: '0 0 8px' }}>Temporary password: <code>{result.tempPassword}</code></p>
          <p style={{ margin: 0, fontSize: '0.85em', color: '#666' }}>They can change their password after logging in via Forgot Password.</p>
        </div>
      )}
    </div>
  );
}

export default function AdminUI() {
    const PUBLIC_URL = " http://10.192.204.178:3000";
    const [form, setForm] = useState({
        name: "",
        event_type: "PROFESSIONAL", 
        points: 0,
        is_mandatory: false,
        date: "",
        has_check_in_window: false,
        check_in_start_offset_minutes: "0",
        check_in_end_offset_minutes: "30",
        committee_id: "",
        project_id: "",
        created_at: ""
    });
    const [message, setMessage] = useState("");
    const [checkInUrl, setCheckInUrl] = useState("");
    useEffect(() => {
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const formatted =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
        `T${pad(now.getHours())}:${pad(now.getMinutes())}`;
        setForm(prev => ({...prev, created_at: formatted}));
    }, []);
    function change(e: any) {

        const { name, value, type, checked } = e.target;
        setForm(prev => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
    }
    async function fetchQrSecret(): Promise<string> {
        const res = await fetch("/api/admin/generate-secret/check-in");
        if (!res.ok) {
            throw new Error("Failed to generate QR secret");
        }
        const data = await res.json();
        return data.secret;
    }
    async function handleSubmit(e: any) {
        e.preventDefault();

        try {
            const eventDate = new Date(form.date);

            if (Number.isNaN(eventDate.getTime())) {
                setMessage("Please enter a valid event date.");
                setCheckInUrl("");
                return;
            }

            const startOffsetMinutes = Number(form.check_in_start_offset_minutes);
            const endOffsetMinutes = Number(form.check_in_end_offset_minutes);

            if (
                form.has_check_in_window &&
                startOffsetMinutes > endOffsetMinutes
            ) {
                setMessage("Check-in start must be before check-in end.");
                setCheckInUrl("");
                return;
            }

            const secret = await fetchQrSecret();
            const checkInStartsAt = new Date(eventDate.getTime() + startOffsetMinutes * 60_000);
            const checkInEndsAt = new Date(eventDate.getTime() + endOffsetMinutes * 60_000);

            const payload = {
                name: form.name,
                event_type: form.event_type,
                points: Number(form.points),
                is_mandatory: Boolean(form.is_mandatory),
                date: eventDate.toISOString(),
                check_in_starts_at: form.has_check_in_window
                    ? checkInStartsAt.toISOString()
                    : null,
                check_in_ends_at: form.has_check_in_window
                    ? checkInEndsAt.toISOString()
                    : null,
                created_at: new Date(form.created_at).toISOString(),
                qr_code_secret: secret,
            };

            const { error } = await supabase.from("events").insert(payload);

            if (error) {
              setMessage(error.message);
              setCheckInUrl("");
              return;
            }

            //success message + localized link
            const url = `${PUBLIC_URL}/check-in/${secret}`;            
            setMessage("Event created!");
            setCheckInUrl(url);
        } catch (err: any) {
          setMessage(err?.message ?? "Something went wrong generating the secret.");
          setCheckInUrl("");
        }
    }
    return (
        <div>
            <InviteMember />
            <h2>Create Event</h2>
            <form onSubmit={handleSubmit}>
                <div>
                    <label>Name:</label><br />
                    <input name="name" value={form.name} onChange={change} />
                </div>
                <div>
                    <label>Event Type:</label><br />
                    <select name="event_type" value={form.event_type} onChange={change}>
                        <option value="PROFESSIONAL">PROFESSIONAL</option>
                        <option value="SERVICE">SERVICE</option>
                        <option value="SOCIAL">SOCIAL</option>
                        <option value="GENERAL_MEETING">GENERAL_MEETING</option>
                        <option value="NEW_MEMBER_WORKSHOP">NEW_MEMBER_WORKSHOP</option>
                        <option value="PROJECT_MEETING">PROJECT_MEETING</option>
                        <option value="OTHER_MANDATORY">OTHER_MANDATORY</option>
                    </select>
                </div>
                <div>
                    <label>Points:</label><br />
                    <input
                        type="number"
                        name="points"
                        value={form.points}
                        onChange={change}
                    />
                </div>
                <div>
                    <label>Mandatory:</label>
                    <input
                        type="checkbox"
                        name="is_mandatory"
                        checked={form.is_mandatory}
                        onChange={change}
                    />
                </div>
                <div>
                    <label>Date:</label><br />
                    <input
                        type="datetime-local"
                        name="date"
                        value={form.date}
                        onChange={change}
                    />
                </div>
                <div>
                    <label>Check-In Window:</label>
                    <input
                        type="checkbox"
                        name="has_check_in_window"
                        checked={form.has_check_in_window}
                        onChange={(e) =>
                            setForm(prev => ({
                                ...prev,
                                has_check_in_window: e.target.checked,
                            }))
                        }
                    />
                </div>
                {form.has_check_in_window && (
                    <div
                        style={{
                            marginLeft: "20px",
                            marginTop: "12px",
                            padding: "12px 16px",
                            borderLeft: "3px solid #2563eb",
                            background: "#000000",
                            color: "#ffffff",
                        }}
                    >
                        <div>
                            <label>Check-In Starts (negative values allowed):</label><br />
                            <input
                                type="number"
                                name="check_in_start_offset_minutes"
                                value={form.check_in_start_offset_minutes}
                                onChange={change}
                                style={{ color: "#ffffff", background: "#000000" }}
                            />
                        </div>
                        <div style={{ marginTop: "12px" }}>
                            <label>Check-In Ends:</label><br />
                            <input
                                type="number"
                                name="check_in_end_offset_minutes"
                                value={form.check_in_end_offset_minutes}
                                onChange={change}
                                style={{ color: "#ffffff", background: "#000000" }}
                            />
                        </div>
                    </div>
                )}
                <div>
                    <label>Committee ID:</label><br />
                    <input
                        name="committee_id"
                        value={form.committee_id}
                        onChange={change}
                    />
                </div>
                <div>
                    <label>Project ID:</label><br />
                    <input
                        name="project_id"
                        value={form.project_id}
                        onChange={change}
                    />
                </div>
                <div>
                    <label>Created At:</label><br />
                    <input
                        type="datetime-local"
                        name="created_at"
                        value={form.created_at}
                        onChange={change}
                    />
                </div>
                <br />
                <button type="submit">Create Event</button>
            </form>
            {message && <p>{message}</p>}
            {checkInUrl && (
                <div style={{ marginTop: "20px" }}>
                    <p>Check-in link:</p>
                    <a href={checkInUrl} target="_blank" rel="noopener noreferrer">
                        {checkInUrl}
                    </a>

                    <div
                        style={{
                            marginTop: "16px",
                            background: "white",
                            padding: "16px",
                            display: "inline-block",
                        }}
                    >
                        <QRCode value={checkInUrl} size={220} />
                    </div>
                </div>
            )}
        </div>
    );
}
