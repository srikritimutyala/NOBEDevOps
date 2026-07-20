"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function SendEmailPage() {
  const [preview, setPreview] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const [reminderText, setReminderText] = useState("");
  const [reminderLoading, setReminderLoading] = useState(true);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderSaved, setReminderSaved] = useState(false);

  useEffect(() => {
    loadReminderNote();
  }, []);

  async function loadReminderNote() {
    setReminderLoading(true);
    try {
      const res = await fetch("/api/admin/weekly-reminder-note");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load reminders.");
      setReminderText(data.text);
    } catch (err: any) {
      setReminderError(err.message);
    } finally {
      setReminderLoading(false);
    }
  }

  async function handleSaveReminder() {
    setReminderSaving(true);
    setReminderError(null);
    setReminderSaved(false);
    try {
      const res = await fetch("/api/admin/weekly-reminder-note", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reminderText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setReminderSaved(true);
    } catch (err: any) {
      setReminderError(err.message);
    } finally {
      setReminderSaving(false);
    }
  }

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
    setLoading(true);
    setResult(null);
    try {
      // Quietly check the recipient count first so the confirm dialog is accurate.
      const previewRes = await fetch("/api/send-weekly-digest?dryRun=true", { method: "POST" });
      const previewData = await previewRes.json();
      const count = previewData?.count ?? 0;

      if (!confirm(`Send this to ${count} people? This cannot be undone.`)) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/send-weekly-digest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send.");
      setResult(data.message);
      setPreview(null);
      setReminderText(""); // reflect that the note was cleared after sending
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
          <h2 className="section-title">Additional reminders</h2>
          <p className="page-subtitle">
            This text appears at the bottom of the next digest email. It clears automatically after sending.
          </p>

          {reminderLoading ? (
            <p>Loading...</p>
          ) : (
            <>
              <textarea
                value={reminderText}
                onChange={(e) => {
                  setReminderText(e.target.value);
                  setReminderSaved(false);
                }}
                placeholder="e.g. Buy your tickets for our upcoming event!"
                className="field-input"
                rows={5}
                style={{ resize: "vertical" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button onClick={handleSaveReminder} disabled={reminderSaving} className="btn-secondary">
                  {reminderSaving ? "Saving..." : "Save reminders"}
                </button>
                {reminderSaved && <span className="text-sm text-emerald-700">Saved!</span>}
              </div>
            </>
          )}

          {reminderError && <div className="message-error">{reminderError}</div>}
        </div>

        <div className="panel field-group">
          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={handlePreview} disabled={loading} className="btn-secondary">
              {loading ? "Loading..." : "Preview recipients"}
            </button>
            <button onClick={handleSend} disabled={loading} className="btn">
              {loading ? "Sending..." : "Send weekly digest"}
            </button>
          </div>

          {preview && (
            <div className="subtle-card space-y-2">
              <p className="font-medium">{preview.length} people would receive this email:</p>
              <ul style={{ maxHeight: "200px", overflowY: "auto", fontSize: "0.9rem" }}>
                {preview.map((email) => (
                  <li key={email}>{email}</li>
                ))}
              </ul>
            </div>
          )}

          {result && <div className="message-success">{result}</div>}
        </div>
      </div>
    </div>
  );
}