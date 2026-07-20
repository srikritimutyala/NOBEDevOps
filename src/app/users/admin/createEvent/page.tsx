"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "react-qr-code";
import { createClient } from "@/app/utils/supabase/client";

const supabase = createClient();


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

function normalizeEventType(typeStr: string): string {
  const s = typeStr.trim().toUpperCase().replace(/[\s_-]+/g, "_");
  if (s.startsWith("PROF")) return "PROFESSIONAL";
  if (s.startsWith("SERV")) return "SERVICE";
  if (s.startsWith("SOCI")) return "SOCIAL";
  if (s.startsWith("GEN")) return "GENERAL_MEETING";
  if (s.startsWith("NEW") || s.includes("WORKSHOP")) return "NEW_MEMBER_WORKSHOP";
  if (s.startsWith("PROJ")) return "PROJECT_MEETING";
  if (s.includes("OTHER") || s.includes("MAND")) return "OTHER_MANDATORY";
  return "PROFESSIONAL"; // default fallback
}

function normalizeDresscode(codeStr: string): string {
  const s = codeStr.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (s.includes("casual") && !s.includes("business")) return "Casual";
  if (s.includes("business casual") || s.includes("biz casual")) return "Business Casual";
  if (s.includes("business professional") || s.includes("biz prof") || s.includes("professional")) return "Business Professional";
  if (s.includes("formal")) return "Formal";
  return "Casual"; // default fallback
}

function parseEventsCsv(text: string) {
  const parseCsvLine = (line: string) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV file must have a header row and at least one event data row.");
  }

  const headers = parseCsvLine(lines[0]);
  const headerIndexes = {
    name: -1,
    points: -1,
    date: -1,
    start_time: -1,
    end_time: -1,
    event_type: -1,
    is_mandatory: -1,
    check_in_start_offset_minutes: -1,
    check_in_end_offset_minutes: -1,
    location: -1,
    dresscode: -1,
  };

  headers.forEach((h, idx) => {
    const norm = h.toLowerCase().trim();
    if (norm === "name" || norm === "event name" || norm === "title" || norm === "event") {
      headerIndexes.name = idx;
    } else if (norm === "points" || norm === "pts" || norm === "point value") {
      headerIndexes.points = idx;
    } else if (norm === "date" || norm === "day" || norm === "event date") {
      headerIndexes.date = idx;
    } else if (norm === "start time" || norm === "start_time" || norm === "start") {
      headerIndexes.start_time = idx;
    } else if (norm === "end time" || norm === "end_time" || norm === "end") {
      headerIndexes.end_time = idx;
    } else if (norm === "event type" || norm === "type" || norm === "category" || norm === "event_type") {
      headerIndexes.event_type = idx;
    } else if (norm.includes("mandatory") || norm.includes("required") || norm.includes("if its mandatory")) {
      headerIndexes.is_mandatory = idx;
    } else if (
      norm.includes("start offset") ||
      norm.includes("check-in start") ||
      norm.includes("check in start") ||
      norm.includes("start_offset") ||
      norm.includes("start offset (minutes)")
    ) {
      headerIndexes.check_in_start_offset_minutes = idx;
    } else if (
      norm.includes("end offset") ||
      norm.includes("check-in end") ||
      norm.includes("check in end") ||
      norm.includes("end_offset") ||
      norm.includes("end offset (minutes)")
    ) {
      headerIndexes.check_in_end_offset_minutes = idx;
    } else if (norm === "location" || norm === "room" || norm === "place") {
      headerIndexes.location = idx;
    } else if (norm === "dress code" || norm === "dresscode" || norm === "dress") {
      headerIndexes.dresscode = idx;
    }
  });

  const missingRequired: string[] = [];
  if (headerIndexes.name === -1) missingRequired.push("Name");
  if (headerIndexes.points === -1) missingRequired.push("Points");
  if (headerIndexes.date === -1) missingRequired.push("Date");
  if (headerIndexes.start_time === -1) missingRequired.push("Start Time");
  if (headerIndexes.end_time === -1) missingRequired.push("End Time");
  if (headerIndexes.event_type === -1) missingRequired.push("Event Type");

  if (missingRequired.length > 0) {
    throw new Error(
      `CSV is missing required headers: ${missingRequired.join(
        ", "
      )}. Please ensure these headers are present.`
    );
  }

  const parsedEvents: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

    const getValue = (idx: number, fallback = "") => {
      if (idx === -1 || idx >= cols.length) return fallback;
      return cols[idx];
    };

    const rawName = getValue(headerIndexes.name);
    const rawPoints = getValue(headerIndexes.points);
    const rawDate = getValue(headerIndexes.date);
    const rawStartTime = getValue(headerIndexes.start_time);
    const rawEndTime = getValue(headerIndexes.end_time);
    const rawType = getValue(headerIndexes.event_type);
    const rawMandatory = getValue(headerIndexes.is_mandatory);
    const rawStartOffset = getValue(headerIndexes.check_in_start_offset_minutes, "0");
    const rawEndOffset = getValue(headerIndexes.check_in_end_offset_minutes, "30");
    const rawLocation = getValue(headerIndexes.location, "TBD");
    const rawDresscode = getValue(headerIndexes.dresscode, "Casual");

    if (!rawName.trim() || !rawDate.trim() || !rawStartTime.trim() || !rawEndTime.trim()) {
      continue;
    }

    const eventStart = new Date(`${rawDate.trim()} ${rawStartTime.trim()}`);
    const eventEnd = new Date(`${rawDate.trim()} ${rawEndTime.trim()}`);

    if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) {
      continue;
    }

    const normType = normalizeEventType(rawType);
    const isMandatory = ["yes", "true", "1", "y", "mandatory"].includes(
      rawMandatory.toLowerCase().trim()
    );

    const startOffset = Number(rawStartOffset) || 0;
    const endOffset = Number(rawEndOffset) || 30;

    const hasCustomStartsOffset = headerIndexes.check_in_start_offset_minutes !== -1 && rawStartOffset.trim() !== "";
    const hasCustomEndsOffset = headerIndexes.check_in_end_offset_minutes !== -1 && rawEndOffset.trim() !== "";

    const checkInStartsAt = hasCustomStartsOffset
      ? new Date(eventStart.getTime() + startOffset * 60_000).toISOString()
      : eventStart.toISOString();

    const checkInEndsAt = hasCustomEndsOffset
      ? new Date(eventStart.getTime() + endOffset * 60_000).toISOString()
      : eventEnd.toISOString();

    parsedEvents.push({
      name: rawName.trim(),
      points: Number(rawPoints) || 0,
      date: eventStart.toISOString(),
      event_type: normType,
      is_mandatory: isMandatory,
      check_in_start_offset_minutes: startOffset,
      check_in_end_offset_minutes: endOffset,
      check_in_starts_at: checkInStartsAt,
      check_in_ends_at: checkInEndsAt,
      location: rawLocation.trim(),
      dresscode: normalizeDresscode(rawDresscode),
    });
  }

  return parsedEvents;
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
    description: "",
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

  // Bulk Import States
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkEvents, setBulkEvents] = useState<any[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    addedCount: number;
    skippedCount: number;
    failedCount: number;
    skippedDuplicates: any[];
    failedEvents: any[];
  } | null>(null);

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
        .select(
          "id, name, event_type, dresscode, points, is_mandatory, date, location, created_at, qr_code_secret, check_in_starts_at, check_in_ends_at, description"
        )
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
        end_time: hasValidCheckInEnd
          ? toTimeInputValue(checkInEnd as Date)
          : hasValidStart
          ? toTimeInputValue(eventStart)
          : "19:00",
        location: data.location ?? "",
        description: data.description ?? "",
        has_check_in_window: hasCustomWindow,
        check_in_start_offset_minutes: hasCustomWindow
          ? String(Math.round((checkInStart as Date).getTime() - eventStart.getTime()) / 60000)
          : "0",
        check_in_end_offset_minutes:
          hasCustomWindow && hasValidCheckInEnd
            ? String(Math.round((checkInEnd as Date).getTime() - eventStart.getTime()) / 60000)
            : "30",
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

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
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

      if (form.has_check_in_window && startOffsetMinutes > endOffsetMinutes) {
        setMessage("Check-in start must be before check-in end.");
        return;
      }

      const checkInStartsAt = form.has_check_in_window
        ? new Date(eventStart.getTime() + startOffsetMinutes * 60_000)
        : eventStart;

      const checkInEndsAt = form.has_check_in_window
        ? new Date(eventStart.getTime() + endOffsetMinutes * 60_000)
        : eventEnd;

      const createdAtValue = form.created_at ? new Date(form.created_at) : new Date();

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
        description: form.description.trim(),
        created_at: createdAtValue.toISOString(),
        qr_code_secret: secret,
      };

      let newEventId: string | null = null;
      if (eventId) {
        const { error } = await supabase.from("events").update(payload).eq("id", eventId);
        if (error) {
          setMessage(error.message);
          return;
        }
      } else {
        const { data: inserted, error } = await supabase
          .from("events")
          .insert(payload)
          .select("id")
          .single();
        if (error) {
          setMessage(error.message);
          return;
        }
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
            gcalWarning = ` (Google Calendar sync failed: ${
              gcalData.error ?? gcalRes.statusText
            })`;
          } else if (gcalData.googleEventId && newEventId) {
            await supabase
              .from("events")
              .update({ gcal_event_id: gcalData.googleEventId })
              .eq("id", newEventId);
          }
        } catch (gcalErr: any) {
          gcalWarning = ` (Google Calendar sync failed: ${
            gcalErr?.message ?? "network error"
          })`;
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

  // Bulk Import Handlers
  const preventDefault = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    preventDefault(e);
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    preventDefault(e);
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLElement>) => {
    preventDefault(e);
    setIsDragOver(false);
    setBulkError(null);
    setBulkMessage(null);
    setImportSummary(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processCsvFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBulkError(null);
    setBulkMessage(null);
    setImportSummary(null);

    const files = e.target.files;
    if (files && files.length > 0) {
      await processCsvFile(files[0]);
      e.target.value = "";
    }
  };

  const processCsvFile = async (file: File) => {
    if (file.type !== "text/csv" && !file.name.toLowerCase().endsWith(".csv")) {
      setBulkError("Only CSV files are supported. Please upload a .csv file.");
      return;
    }

    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });

      const parsed = parseEventsCsv(text);
      if (parsed.length === 0) {
        setBulkError("No valid events found in the CSV file.");
      } else {
        setBulkEvents(parsed);
        setBulkMessage(
          `Parsed ${parsed.length} events from CSV. Please review the preview before importing.`
        );
      }
    } catch (err: any) {
      setBulkError(err?.message || "Failed to parse CSV file.");
    }
  };

  const handleBulkImport = async () => {
    if (bulkEvents.length === 0) return;

    setIsBulkSubmitting(true);
    setBulkError(null);
    setBulkMessage(null);
    setImportSummary(null);

    try {
      const response = await fetch("/api/admin/bulk-add-events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ events: bulkEvents }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Bulk import failed.");
      }

      setBulkMessage(data.message);
      setImportSummary({
        addedCount: data.addedCount,
        skippedCount: data.skippedCount,
        failedCount: data.failedCount,
        skippedDuplicates: data.skippedDuplicates ?? [],
        failedEvents: data.failedEvents ?? [],
      });
      setBulkEvents([]);
    } catch (err: any) {
      setBulkError(err?.message || "Bulk import failed.");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const downloadCsvTemplate = () => {
    window.location.href = "/api/admin/download-events-template";
  };

  return (
    <div className="app-shell">
      <div className="page-frame page-stack" style={{ maxWidth: "960px" }}>
        <section className="hero-card">
          <div className="page-header">
            <div>
              <p className="eyebrow">Administration</p>
              <h1 className="page-title">
                {eventId ? "Edit event" : isBulkMode ? "Bulk Add Events" : "Create an event"}
              </h1>
              <p className="page-subtitle">
                {eventId
                  ? "Update the event details, attendance window, and check-in link without creating a duplicate event."
                  : isBulkMode
                  ? "Upload a CSV file containing multiple events to insert them in bulk, with duplicate event checking."
                  : "Required: name, type, points, event timing, location, and optional custom check-in window."}
              </p>
            </div>
            <div className="action-row">
              {!eventId && (
                <button
                  type="button"
                  onClick={() => {
                    setIsBulkMode(!isBulkMode);
                    setBulkError(null);
                    setBulkMessage(null);
                    setImportSummary(null);
                    setBulkEvents([]);
                  }}
                  className="btn"
                >
                  {isBulkMode ? "Single Event Mode" : "Bulk Import (CSV)"}
                </button>
              )}
              <Link href="/users/admin" className="btn-secondary">
                Back to Admin
              </Link>
            </div>
          </div>
        </section>

        {!isBulkMode ? (
          <>
            <form onSubmit={handleSubmit} className="panel field-group">
              {isLoadingEvent ? <div className="message">Loading event details...</div> : null}
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
                  <p className="toggle-copy">
                    Turn this on for meetings or events members are expected to attend.
                  </p>
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

              <div className="field-group" style={{ marginBottom: "20px" }}>
                <label className="field-label">Description / Notes &amp; Reminders</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="Enter details, description, notes, or reminders for this event..."
                  className="field-input"
                  rows={4}
                  style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid var(--border)", resize: "vertical", fontSize: "0.9rem", lineHeight: "1.4" }}
                />
              </div>

              <div className="toggle-row">
                <div>
                  <label className="field-label">Use custom check-in window</label>
                  <p className="toggle-copy">
                    Useful when members should check in before or after the official start time.
                  </p>
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
                  {isSubmitting
                    ? eventId
                      ? "Saving changes..."
                      : "Creating event..."
                    : eventId
                    ? "Save Changes"
                    : "Create Event"}
                </button>
              </div>
            </form>

            {message && (
              <div
                className={
                  message === "Event created successfully." ||
                  message === "Event updated successfully."
                    ? "message-success"
                    : "message"
                }
              >
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
                  <button type="button" onClick={handleDownloadQrCode} className="btn-secondary">
                    Download QR code image
                  </button>
                </div>

                {downloadError && <p className="message-error">{downloadError}</p>}
              </section>
            )}
          </>
        ) : (
          <div className="page-stack">
            <div className="panel field-group" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div
                className="dropzone"
                style={{
                  border: isDragOver ? "2px dashed var(--accent)" : "2px dashed var(--border-strong)",
                  borderRadius: "20px",
                  padding: "48px 24px",
                  textAlign: "center",
                  backgroundColor: isDragOver ? "rgba(229, 138, 39, 0.05)" : "rgba(255, 255, 255, 0.4)",
                  transition: "all 0.2s ease-in-out",
                  cursor: "pointer",
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("csv-file-input")?.click()}
              >
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <div style={{ fontSize: "3rem", marginBottom: "12px" }}>📅</div>
                <h3 className="section-title" style={{ marginBottom: "8px" }}>Drag & Drop CSV File</h3>
                <p className="section-copy" style={{ margin: 0 }}>
                  or click to browse your computer (.csv)
                </p>
              </div>

              <div className="panel subtle-card" style={{ display: "flex", flexDirection: "column", gap: "16px", background: "rgba(255,255,255,0.7)", borderRadius: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <h3 className="section-title">Google Sheets / Excel Template</h3>
                    <p className="section-copy" style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                      Download the formatted template, import it into Google Sheets to use drop-down lists and calendar pickers, then export as CSV to upload.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={downloadCsvTemplate}
                    className="btn"
                    style={{ fontSize: "0.8rem", padding: "6px 12px", minHeight: "36px" }}
                  >
                    📥 Download Sheets Template (.xlsx)
                  </button>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse", color: "var(--foreground)" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border-strong)", textAlign: "left" }}>
                        <th style={{ padding: "8px 4px" }}>Header Column</th>
                        <th style={{ padding: "8px 4px" }}>Status</th>
                        <th style={{ padding: "8px 4px" }}>Accepted Formats / Options</th>
                        <th style={{ padding: "8px 4px" }}>Default Fallback</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>Name</td>
                        <td style={{ padding: "8px 4px", color: "var(--danger)" }}>Required</td>
                        <td style={{ padding: "8px 4px" }}>Text (Event Name)</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>N/A</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>Points</td>
                        <td style={{ padding: "8px 4px", color: "var(--danger)" }}>Required</td>
                        <td style={{ padding: "8px 4px" }}>Number (Points awarded)</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>N/A</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>Date</td>
                        <td style={{ padding: "8px 4px", color: "var(--danger)" }}>Required</td>
                        <td style={{ padding: "8px 4px" }}>`YYYY-MM-DD` or `MM/DD/YYYY`</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>N/A</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>Start Time</td>
                        <td style={{ padding: "8px 4px", color: "var(--danger)" }}>Required</td>
                        <td style={{ padding: "8px 4px" }}>`HH:MM` or `HH:MM AM/PM` (e.g. `18:00`, `6:00 PM`)</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>N/A</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>End Time</td>
                        <td style={{ padding: "8px 4px", color: "var(--danger)" }}>Required</td>
                        <td style={{ padding: "8px 4px" }}>`HH:MM` or `HH:MM AM/PM` (e.g. `19:30`, `7:30 PM`)</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>N/A</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>Event Type</td>
                        <td style={{ padding: "8px 4px", color: "var(--danger)" }}>Required</td>
                        <td style={{ padding: "8px 4px" }}>
                          PROFESSIONAL, SERVICE, SOCIAL, GENERAL_MEETING, NEW_MEMBER_WORKSHOP, PROJECT_MEETING, OTHER_MANDATORY
                        </td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>N/A</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>Mandatory</td>
                        <td style={{ padding: "8px 4px", color: "var(--accent)" }}>Optional</td>
                        <td style={{ padding: "8px 4px" }}>`Yes` / `No`, `True` / `False`, `1` / `0`</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>No</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>Start Offset</td>
                        <td style={{ padding: "8px 4px", color: "var(--accent)" }}>Optional</td>
                        <td style={{ padding: "8px 4px" }}>Integer in minutes (Negative values allowed, e.g. `-15`)</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>0 (Starts at event start)</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>End Offset</td>
                        <td style={{ padding: "8px 4px", color: "var(--accent)" }}>Optional</td>
                        <td style={{ padding: "8px 4px" }}>Integer in minutes (Check-in window end relative to start)</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>Closes at event `End Time`</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>Location</td>
                        <td style={{ padding: "8px 4px", color: "var(--accent)" }}>Optional</td>
                        <td style={{ padding: "8px 4px" }}>Text (Event location description)</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>"TBD"</td>
                      </tr>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 4px", fontWeight: "bold" }}>Dress Code</td>
                        <td style={{ padding: "8px 4px", color: "var(--accent)" }}>Optional</td>
                        <td style={{ padding: "8px 4px" }}>Casual, Business Casual, Business Professional, Formal</td>
                        <td style={{ padding: "8px 4px", color: "var(--muted)" }}>"Casual"</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {bulkError && <div className="message-error">{bulkError}</div>}
            {bulkMessage && <div className="message-success">{bulkMessage}</div>}

            {bulkEvents.length > 0 && (
              <div className="panel" style={{ marginTop: "24px" }}>
                <div className="panel-header">
                  <div>
                    <h2 className="section-title">Parsed Events ({bulkEvents.length})</h2>
                    <p className="section-copy">Review the events parsed from the CSV file before importing.</p>
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--border-strong)", textAlign: "left" }}>
                        <th style={{ padding: "10px 8px" }}>Name</th>
                        <th style={{ padding: "10px 8px" }}>Type</th>
                        <th style={{ padding: "10px 8px" }}>Points</th>
                        <th style={{ padding: "10px 8px" }}>Date</th>
                        <th style={{ padding: "10px 8px" }}>Mandatory</th>
                        <th style={{ padding: "10px 8px" }}>Location</th>
                        <th style={{ padding: "10px 8px" }}>Offsets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkEvents.map((evt, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "12px 8px", fontWeight: 600 }}>{evt.name}</td>
                          <td style={{ padding: "12px 8px" }}>
                            <span className="calendar-event-chip" style={{ fontSize: "0.8rem" }}>{evt.event_type}</span>
                          </td>
                          <td style={{ padding: "12px 8px" }}>{evt.points} pts</td>
                          <td style={{ padding: "12px 8px", fontSize: "0.85rem" }}>
                            {new Date(evt.date).toLocaleString()}
                          </td>
                          <td style={{ padding: "12px 8px" }}>{evt.is_mandatory ? "✅ Yes" : "❌ No"}</td>
                          <td style={{ padding: "12px 8px" }}>{evt.location}</td>
                          <td style={{ padding: "12px 8px", fontSize: "0.85rem", color: "var(--muted)" }}>
                            Start: {evt.check_in_start_offset_minutes}m<br />
                            End: {evt.check_in_end_offset_minutes}m
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="action-row" style={{ marginTop: "20px" }}>
                  <button
                    type="button"
                    onClick={handleBulkImport}
                    disabled={isBulkSubmitting}
                    className="btn"
                  >
                    {isBulkSubmitting ? "Importing..." : `Import ${bulkEvents.length} Events`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkEvents([])}
                    className="btn-secondary"
                    style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                    disabled={isBulkSubmitting}
                  >
                    Clear List
                  </button>
                </div>
              </div>
            )}

            {importSummary && (
              <div className="panel subtle-card" style={{ marginTop: "24px", border: "1px solid var(--border-strong)" }}>
                <h2 className="section-title" style={{ color: "var(--success)" }}>Import completed!</h2>
                <p className="section-copy">
                  Added: <strong>{importSummary.addedCount}</strong> · Skipped (Duplicates): <strong>{importSummary.skippedCount}</strong> · Failed: <strong>{importSummary.failedCount}</strong>
                </p>

                {importSummary.skippedDuplicates.length > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <p className="field-label" style={{ color: "var(--muted)" }}>Skipped duplicate events:</p>
                    <ul style={{ margin: "8px 0 0 20px", padding: 0, listStyleType: "disc" }}>
                      {importSummary.skippedDuplicates.map((item, idx) => (
                        <li key={idx} style={{ fontSize: "0.85rem", color: "var(--foreground)" }}>
                          <strong>{item.name}</strong> on {new Date(item.date).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {importSummary.failedEvents.length > 0 && (
                  <div style={{ marginTop: "16px" }}>
                    <p className="field-label" style={{ color: "var(--danger)" }}>Failed events:</p>
                    <ul style={{ margin: "8px 0 0 20px", padding: 0, listStyleType: "disc" }}>
                      {importSummary.failedEvents.map((item, idx) => (
                        <li key={idx} style={{ fontSize: "0.85rem", color: "var(--danger)" }}>
                          <strong>{item.event?.name || "Unnamed"}</strong>: {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
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
