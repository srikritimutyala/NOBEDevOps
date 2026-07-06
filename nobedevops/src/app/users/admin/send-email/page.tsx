"use client";

import { useState } from "react";
import Link from "next/link";

export default function SendEmailPage() {
  const [preview, setPreview] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handlePreview() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/send-weekly-digest?dryRun=true", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to preview.");
      setPreview(data.wouldSendTo);
    } catch (err: any) {
      setResult(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!confirm(`Send this to ${preview?.length ?? 0} people? This cannot be undone.`)) {
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/send-weekly-digest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send.");
      setResult(data.message);
      setPreview(null);
    } catch (err: any) {
      setResult(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="page-frame page-stack" style={{ maxWidth: "720px" }}>
        <section className="hero-card">
          <div className="page-header">
            <div>
              <p className="eyebrow">Administration</p>
              <h1 className="page-title">Send weekly digest</h1>
              <p className="page-subtitle">
                Sends every member their current points progress plus this week's events and any admin reminders.
              </p>
            </div>
            <Link href="/users/admin" className="btn-secondary">
              Back to Admin
            </Link>
          </div>
        </section>

        <div className="panel field-group">
          <button onClick={handlePreview} disabled={loading} className="btn-secondary">
            {loading ? "Loading..." : "Preview recipients"}
          </button>

          {preview && (
            <div className="subtle-card space-y-2">
              <p className="font-medium">{preview.length} people will receive this email:</p>
              <ul style={{ maxHeight: "200px", overflowY: "auto", fontSize: "0.9rem" }}>
                {preview.map((email) => (
                  <li key={email}>{email}</li>
                ))}
              </ul>
              <button onClick={handleSend} disabled={loading} className="btn button-full">
                {loading ? "Sending..." : `Send to ${preview.length} people`}
              </button>
            </div>
          )}

          {result && <div className="message-success">{result}</div>}
        </div>
      </div>
    </div>
  );
}