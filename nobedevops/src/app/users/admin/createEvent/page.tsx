"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

const eventTypes = [
  "PROFESSIONAL",
  "SERVICE",
  "SOCIAL",
  "GENERAL_MEETING",
  "NEW_MEMBER_WORKSHOP",
  "PROJECT_MEETING",
  "OTHER_MANDATORY",
];

const dressCodes = [
  "Casual",
  "Business Casual",
  "Business Professional",
  "Formal",
];

function combineDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const combined = new Date(`${date}T${time}`);
  return Number.isNaN(combined.getTime()) ? null : combined;
}

function CreateEventContent() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId");
  const [form, setForm] = useState({
    name: "",
    event_type: "PROFESSIONAL",
    dresscode: "Casual",
    points: 0,
    is_mandatory: false,
    date: "",
    start_time: "18:00",
    end_time: "19:00",
    location: "",
    has_check_in_window: false,
    check_in_start_offset_minutes: "0",
    check_in_end_offset_minutes: "30",
    created_at: "",
  });

  const [message, setMessage] = useState<string | null>(null);
  const [qrLink, setQrLink] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(false);
  const qrRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (eventId) {
      return;
    }

    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");

    const defaultDate = today.toISOString().slice(0, 10);
    const createdAtLocal =
      `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` +
      `T${pad(today.getHours())}:${pad(today.getMinutes())}`;

    setForm((prev) => ({
      ...prev,
      date: defaultDate,
      created_at: createdAtLocal,
    }));
  }, [eventId]);

  useEffect(() => {
    if (!eventId) {
      return;
    }

    let cancelled = false;

    async function loadEvent() {
      setIsLoadingEvent(true);
      setMessage(null);

      const { data, error } = await supabase
        .from("events")
        .select("id, name, event_type, dresscode, points, is_mandatory, date, location, created_at, qr_code_secret, check_in_starts_at, check_in_ends_at")
        .eq("id", eventId)
        .single();

      if (cancelled) {
        return;
      }

      if (error || !data) {
        setMessage(error?.message ?? "Unable to load event details.");
        setIsLoadingEvent(false);
        return;
      }

      const eventStart = new Date(data.date);
      const checkInStart = data.check_in_starts_at ? new Date(data.check_in_starts_at) : null;
      const checkInEnd = data.check_in_ends_at ? new Date(data.check_in_ends_at) : null;
      const createdAt = data.created_at ? new Date(data.created_at) : new Date();

      const hasValidStart = !Number.isNaN(eventStart.getTime());
      const hasValidCheckInStart = checkInStart && !Number.isNaN(checkInStart.getTime());
      const hasValidCheckInEnd = checkInEnd && !Number.isNaN(checkInEnd.getTime());
      const hasCustomWindow =
        Boolean(hasValidCheckInStart && hasValidCheckInEnd) &&
        ((checkInStart as Date).getTime() !== eventStart.getTime() ||
          (checkInEnd as Date).getTime() !== eventStart.getTime());

      setForm({
        name: data.name ?? "",
        event_type: data.event_type ?? "PROFESSIONAL",
        dresscode: data.dresscode ?? "Casual",
        points: data.points ?? 0,
        is_mandatory: data.is_mandatory ?? false,
        date: hasValidStart ? toDateInputValue(eventStart) : "",
        start_time: hasValidStart ? toTimeInputValue(eventStart) : "18:00",
        end_time: hasValidCheckInEnd ? toTimeInputValue(checkInEnd as Date) : (hasValidStart ? toTimeInputValue(eventStart) : "19:00"),
        location: data.location ?? "",
        has_check_in_window: hasCustomWindow,
        check_in_start_offset_minutes:
          hasCustomWindow ? String(Math.round((((checkInStart as Date).getTime() - eventStart.getTime()) / 60000))) : "0",
        check_in_end_offset_minutes:
          hasCustomWindow && hasValidCheckInEnd ? String(Math.round((((checkInEnd as Date).getTime() - eventStart.getTime()) / 60000))) : "30",
        created_at: !Number.isNaN(createdAt.getTime()) ? toDateTimeLocalInputValue(createdAt) : "",
      });

      if (data.qr_code_secret) {
        setQrLink(`${window.location.origin}/check-in/${data.qr_code_secret}`);
      }

      setIsLoadingEvent(false);
    }

    loadEvent();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function handleChange(
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, type } = e.target;
    const value =
      type === "checkbox" && e.target instanceof HTMLInputElement
        ? e.target.checked
        : e.target.value;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function fetchSecret() {
    const res = await fetch("/api/admin/generate-secret/check-in");
    if (!res.ok) {
      throw new Error("Failed to generate QR secret.");
    }
    const data = await res.json();
    return data.secret as string;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setQrLink("");
    setDownloadError(null);
    setIsSubmitting(true);

    try {
      if (
        !form.name.trim() ||
        !form.date ||
        !form.start_time ||
        !form.end_time ||
        !form.location.trim()
      ) {
        setMessage("Please fill in all required fields before submitting.");
        return;
      }

      const eventStart = combineDateTime(form.date, form.start_time);
      const eventEnd = combineDateTime(form.date, form.end_time);

      if (!eventStart || !eventEnd) {
        setMessage("Please enter a valid event date and time.");
        return;
      }

      if (eventEnd <= eventStart) {
        setMessage("End time must be later than start time.");
        return;
      }

      const startOffsetMinutes = Number(form.check_in_start_offset_minutes);
      const endOffsetMinutes = Number(form.check_in_end_offset_minutes);

      if (
        form.has_check_in_window &&
        (Number.isNaN(startOffsetMinutes) || Number.isNaN(endOffsetMinutes))
      ) {
        setMessage("Check-in offsets must be valid numbers.");
        return;
      }

      if (
        form.has_check_in_window &&
        startOffsetMinutes > endOffsetMinutes
      ) {
        setMessage("Check-in start must be before check-in end.");
        return;
      }

      const checkInStartsAt = form.has_check_in_window
        ? new Date(eventStart.getTime() + startOffsetMinutes * 60_000)
        : eventStart;

      const checkInEndsAt = form.has_check_in_window
        ? new Date(eventStart.getTime() + endOffsetMinutes * 60_000)
        : eventEnd;

      const createdAtValue = form.created_at
        ? new Date(form.created_at)
        : new Date();

      if (Number.isNaN(createdAtValue.getTime())) {
        setMessage("Created At is invalid.");
        return;
      }

      let secret = "";

      if (eventId) {
        const { data: existingEvent, error: existingEventError } = await supabase
          .from("events")
          .select("qr_code_secret")
          .eq("id", eventId)
          .single();

        if (existingEventError) {
          setMessage(existingEventError.message);
          return;
        }

        secret = existingEvent?.qr_code_secret ?? "";
      } else {
        secret = await fetchSecret();
      }

      const payload = {
        name: form.name.trim(),
        event_type: form.event_type,
        dresscode: form.dresscode,
        points: Number(form.points),
        is_mandatory: form.is_mandatory,
        date: eventStart.toISOString(),
        check_in_starts_at: checkInStartsAt.toISOString(),
        check_in_ends_at: checkInEndsAt.toISOString(),
        location: form.location.trim(),
        created_at: createdAtValue.toISOString(),
        qr_code_secret: secret,
      };

      let newEventId: string | null = null;
      if (eventId) {
        const { error } = await supabase.from("events").update(payload).eq("id", eventId);
        if (error) { setMessage(error.message); return; }
      } else {
        const { data: inserted, error } = await supabase.from("events").insert(payload).select("id").single();
        if (error) { setMessage(error.message); return; }
        newEventId = inserted?.id ?? null;
      }

      // Push new events to the NOBE Google Calendar (skip on update to avoid duplicates)
      let gcalWarning = "";
      if (!eventId) {
        try {
          const gcalRes = await fetch("/api/gcal-club/create-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: {
                name: payload.name,
                event_type: payload.event_type,
                date: payload.date,
                end_date: checkInEndsAt.toISOString(),
                location: payload.location,
                points: payload.points,
                dresscode: payload.dresscode,
                is_mandatory: payload.is_mandatory,
              },
            }),
          });
          const gcalData = await gcalRes.json().catch(() => ({}));
          if (!gcalRes.ok) {
            gcalWarning = ` (Google Calendar sync failed: ${gcalData.error ?? gcalRes.statusText})`;
          } else if (gcalData.googleEventId && newEventId) {
            await supabase.from("events").update({ gcal_event_id: gcalData.googleEventId }).eq("id", newEventId);
          }
        } catch (gcalErr: any) {
          gcalWarning = ` (Google Calendar sync failed: ${gcalErr?.message ?? "network error"})`;
        }
      }

      const url = `${window.location.origin}/check-in/${secret}`;
      setQrLink(url);
      setMessage(
        eventId
          ? "Event updated successfully."
          : `Event created successfully.${gcalWarning}`
      );
    } catch (err: any) {
      setMessage(err?.message ?? "Unable to create event.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDownloadQrCode() {
    setDownloadError(null);

    if (!qrRef.current) {
      setDownloadError("QR code is not available yet.");
      return;
    }

    const svg = qrRef.current.querySelector("svg");
    if (!svg) {
      setDownloadError("Unable to locate QR code image.");
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          setDownloadError("Unable to create canvas context.");
          URL.revokeObjectURL(url);
          return;
        }

        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (!blob) {
            setDownloadError("Failed to generate download image.");
            URL.revokeObjectURL(url);
            return;
          }

          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = `${
            form.name.trim().replace(/\s+/g, "-").toLowerCase() || "event"
          }-qr.png`;
          link.click();
          URL.revokeObjectURL(link.href);
          URL.revokeObjectURL(url);
        }, "image/png");
      } catch {
        setDownloadError("Unable to generate QR code image.");
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      setDownloadError("Unable to render the QR code image for download.");
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  return (
    <div className="app-shell">
      <div className="page-frame page-stack" style={{ maxWidth: '960px' }}>
        <section className="hero-card">
          <div className="page-header">
            <div>
              <p className="eyebrow">Administration</p>
              <h1 className="page-title">{eventId ? "Edit event" : "Create an event"}</h1>
              <p className="page-subtitle">
                {eventId
                  ? "Update the event details, attendance window, and check-in link without creating a duplicate event."
                  : "Required: name, type, points, event timing, location, and optional custom check-in window."}
              </p>
            </div>
            <Link href="/users/admin" className="btn-secondary">
              Back to Admin
            </Link>
          </div>
        </section>

        <form onSubmit={handleSubmit} className="panel field-group">
          {isLoadingEvent ? (
            <div className="message">Loading event details...</div>
          ) : null}
          <div className="field-group">
            <label className="field-label">Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              className="field-input"
            />
          </div>

          <div className="field-grid two-up">
            <div className="field-group">
              <label className="field-label">Event type</label>
              <select
                name="event_type"
                value={form.event_type}
                onChange={handleChange}
                className="field-select"
              >
                {eventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label className="field-label">Dress Code</label>
              <select
                name="dresscode"
                value={form.dresscode}
                onChange={handleChange}
                className="field-select"
              >
                {dressCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label">Points</label>
            <input
              type="number"
              name="points"
              value={form.points}
              onChange={handleChange}
              className="field-input"
            />
          </div>

          <div className="toggle-row">
            <div>
              <label className="field-label">Mandatory event</label>
              <p className="toggle-copy">Turn this on for meetings or events members are expected to attend.</p>
            </div>
            <input
              type="checkbox"
              name="is_mandatory"
              checked={form.is_mandatory}
              onChange={handleChange}
              className="field-checkbox"
            />
          </div>

          <div className="field-grid two-up">
            <div className="field-group">
              <label className="field-label">Date</label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="field-input"
              />
            </div>
            <div className="field-group">
              <label className="field-label">Location</label>
              <input
                name="location"
                value={form.location}
                onChange={handleChange}
                className="field-input"
              />
            </div>
          </div>

          <div className="field-grid two-up">
            <div className="field-group">
              <label className="field-label">Start time</label>
              <input
                type="time"
                name="start_time"
                value={form.start_time}
                onChange={handleChange}
                className="field-input"
              />
            </div>
            <div className="field-group">
              <label className="field-label">End time</label>
              <input
                type="time"
                name="end_time"
                value={form.end_time}
                onChange={handleChange}
                className="field-input"
              />
            </div>
          </div>

          <div className="toggle-row">
            <div>
              <label className="field-label">Use custom check-in window</label>
              <p className="toggle-copy">Useful when members should check in before or after the official start time.</p>
            </div>
            <input
              type="checkbox"
              name="has_check_in_window"
              checked={form.has_check_in_window}
              onChange={handleChange}
              className="field-checkbox"
            />
          </div>

          {form.has_check_in_window && (
            <div className="subtle-card field-group">
              <div className="field-grid two-up">
                <div className="field-group">
                  <label className="field-label">Check-in start offset (minutes)</label>
                  <input
                    type="number"
                    name="check_in_start_offset_minutes"
                    value={form.check_in_start_offset_minutes}
                    onChange={handleChange}
                    className="field-input"
                  />
                  <p className="field-help">Negative values are allowed.</p>
                </div>

                <div className="field-group">
                  <label className="field-label">Check-in end offset (minutes)</label>
                  <input
                    type="number"
                    name="check_in_end_offset_minutes"
                    value={form.check_in_end_offset_minutes}
                    onChange={handleChange}
                    className="field-input"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Created at</label>
            <input
              type="datetime-local"
              name="created_at"
              value={form.created_at}
              onChange={handleChange}
              className="field-input"
            />
          </div>

          <div className="action-row">
            <button type="submit" disabled={isSubmitting} className="btn">
              {isSubmitting ? (eventId ? "Saving changes..." : "Creating event...") : (eventId ? "Save Changes" : "Create Event")}
            </button>
          </div>
        </form>

        {message && (
          <div className={message === "Event created successfully." || message === "Event updated successfully." ? "message-success" : "message"}>
            {message}
          </div>
        )}

        {qrLink && (
          <section className="panel qr-card">
            <div>
              <p className="eyebrow">Check-In</p>
              <h2 className="section-title">QR code and link</h2>
            </div>
            <a href={qrLink} target="_blank" rel="noreferrer">
              {qrLink}
            </a>

            <div className="qr-frame" ref={qrRef}>
              <QRCode value={qrLink} size={240} />
            </div>

            <div className="action-row">
              <button
                type="button"
                onClick={handleDownloadQrCode}
                className="btn-secondary"
              >
                Download QR code image
              </button>
            </div>

            {downloadError && <p className="message-error">{downloadError}</p>}
          </section>
        )}
      </div>
    </div>
  );
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toDateTimeLocalInputValue(date: Date) {
  return `${toDateInputValue(date)}T${toTimeInputValue(date)}`;
}

export default function CreateEventPage() {
  return (
    <Suspense fallback={<p className="section-copy">Loading...</p>}>
      <CreateEventContent />
    </Suspense>
  );
}
