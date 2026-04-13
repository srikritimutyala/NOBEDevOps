"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
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

function combineDateTime(date: string, time: string) {
  if (!date || !time) return null;
  const combined = new Date(`${date}T${time}`);
  return Number.isNaN(combined.getTime()) ? null : combined;
}

export default function CreateEventPage() {
  const [form, setForm] = useState({
    name: "",
    event_type: "PROFESSIONAL",
    is_mandatory: false,
    date: "",
    start_time: "18:00",
    end_time: "19:00",
    location: "",
  });
  const [message, setMessage] = useState<string | null>(null);
  const [qrLink, setQrLink] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const today = new Date();
    setForm((prev) => ({
      ...prev,
      date: today.toISOString().slice(0, 10),
    }));
  }, []);

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
      if (!form.name.trim() || !form.date || !form.start_time || !form.end_time || !form.location.trim()) {
        setMessage("Please fill in all fields before submitting.");
        return;
      }

      const startDateTime = combineDateTime(form.date, form.start_time);
      const endDateTime = combineDateTime(form.date, form.end_time);

      if (!startDateTime || !endDateTime) {
        setMessage("Please enter a valid date and timing window.");
        return;
      }

      let checkInStart = startDateTime;
      let checkInEnd = endDateTime;
      let fallbackUsed = false;

      if (checkInEnd <= checkInStart) {
        fallbackUsed = true;
        checkInEnd = new Date(checkInStart.getTime() + 60 * 60 * 1000);
      }

      const secret = await fetchSecret();
      const payload = {
        name: form.name.trim(),
        event_type: form.event_type,
        is_mandatory: form.is_mandatory,
        date: checkInStart.toISOString(),
        check_in_starts_at: checkInStart.toISOString(),
        check_in_ends_at: checkInEnd.toISOString(),
        location: form.location.trim(),
        qr_code_secret: secret,
      } as const;

      const { error } = await supabase.from("events").insert(payload);
      if (error) {
        setMessage(error.message);
        return;
      }

      const url = `${window.location.origin}/check-in/${secret}`;
      setQrLink(url);
      setMessage(
        fallbackUsed
          ? "Event created. Fallback time window was used because the end time was not later than the start time."
          : "Event created successfully."
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
          link.download = `${form.name.trim().replace(/\s+/g, "-").toLowerCase() || "event"}-qr.png`;
          link.click();
          URL.revokeObjectURL(link.href);
          URL.revokeObjectURL(url);
        }, "image/png");
      } catch (downloadErr) {
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
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Create Event</h1>
          <p className="text-sm text-gray-600">Only Name, Event type, Mandatory, date, timing, and location are required.</p>
        </div>
        <Link href="/users/admin" className="text-sm text-sky-600 hover:underline">
          Back to Admin
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-black/10 bg-white p-6 shadow-sm">
        <div>
          <label className="block font-medium">Name</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border px-3 py-2"
          />
        </div>

        <div>
          <label className="block font-medium">Event type</label>
          <select
            name="event_type"
            value={form.event_type}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border px-3 py-2"
          >
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label className="font-medium">Mandatory</label>
          <input
            type="checkbox"
            name="is_mandatory"
            checked={form.is_mandatory}
            onChange={handleChange}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block font-medium">Date</label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
          <div>
            <label className="block font-medium">Location</label>
            <input
              name="location"
              value={form.location}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block font-medium">Start time</label>
            <input
              type="time"
              name="start_time"
              value={form.start_time}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
          <div>
            <label className="block font-medium">End time</label>
            <input
              type="time"
              name="end_time"
              value={form.end_time}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-sky-600 px-4 py-2 text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Creating event..." : "Create Event"}
        </button>
      </form>

      {message && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900">
          {message}
        </div>
      )}

      {qrLink && (
        <section className="mt-6 rounded-xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="font-medium">Check-in link</p>
          <a href={qrLink} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline">
            {qrLink}
          </a>

          <div className="mt-4 inline-block rounded-lg bg-white p-4" ref={qrRef}>
            <QRCode value={qrLink} size={240} />
          </div>

          <button
            type="button"
            onClick={handleDownloadQrCode}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
          >
            Download QR code image
          </button>

          {downloadError && <p className="mt-2 text-sm text-red-600">{downloadError}</p>}
        </section>
      )}
    </div>
  );
}
