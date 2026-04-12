"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import QRCode from "react-qr-code";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

export default function AdminUI() {
    const PUBLIC_URL = " http://10.195.105.173:3000";
    const [form, setForm] = useState({
        name: "",
        event_type: "PROFESSIONAL",
        points: 0,
        is_mandatory: false,
        date: "",
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
            const secret = await fetchQrSecret();

            const payload = {
                name: form.name,
                event_type: form.event_type,
                points: Number(form.points),
                is_mandatory: Boolean(form.is_mandatory),
                date: new Date(form.date).toISOString(),
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
