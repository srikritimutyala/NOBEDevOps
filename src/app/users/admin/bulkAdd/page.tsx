"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type DragEvent } from "react";

type UploadEntry = {
  file: File;
  id: string;
};

type DuplicateEntry = {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  illinois_email: string;
  college: string;
  year: string;
  major: string;
  committee: string;
};

export default function BulkAddPage() {
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [populating, setPopulating] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(false);
  const [existingRows, setExistingRows] = useState<DuplicateEntry[]>([]);
  const [showDuplicateDetails, setShowDuplicateDetails] = useState(false);
  const [missingCount, setMissingCount] = useState(0);
  const [missingDetails, setMissingDetails] = useState<Array<{ row: number; missingFields: string[] }>>([]);

  const handlePopulate = async () => {
    setPopulating(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/bulk-add/populate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Populate failed.");
      }

      setMessage(data.message);
      setExistingRows(data.duplicates ?? []);
      setMissingCount(data.missing ?? 0);
      setMissingDetails(data.missingRows ?? []);
      setShowDuplicateDetails(false);
    } catch (populateError: any) {
      setError(populateError?.message || "Unable to populate database.");
      setExistingRows([]);
      setMissingCount(0);
      setMissingDetails([]);
      setShowDuplicateDetails(false);
    } finally {
      setPopulating(false);
    }
  };

  const preventDefault = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const addFiles = (files: FileList | File[]) => {
    const nextFiles = Array.from(files).filter(
      (file) => file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv")
    );

    if (nextFiles.length === 0) {
      setError("Only CSV files are supported. Please add .csv files.");
      return;
    }

    setError(null);
    setUploads((current) => [
      ...current,
      ...nextFiles.map((file) => ({ file, id: `${file.name}-${file.size}-${file.lastModified}` })),
    ]);
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    preventDefault(event);
    if (event.dataTransfer.files?.length) {
      addFiles(event.dataTransfer.files);
    }
  };

  const handleBrowse = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      addFiles(event.target.files);
      event.target.value = "";
    }
  };

  const removeFile = (id: string) => {
    setUploads((current) => current.filter((entry) => entry.id !== id));
  };

  const readText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

  const handleUpload = async () => {
    if (uploads.length === 0) {
      setError("Drop or choose one or more CSV files before uploading.");
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const payload = await Promise.all(
        uploads.map(async (entry) => ({
          name: entry.file.name,
          type: entry.file.type || "text/csv",
          content: await readText(entry.file),
        }))
      );

      const response = await fetch("/api/admin/bulk-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploads: payload }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Upload failed.");
      }

      setMessage(`Uploaded ${data.uploaded} CSV file(s) successfully.`);
      setUploads([]);
      setHasUploaded(true);
      setExistingRows([]);
      setMissingCount(0);
      setMissingDetails([]);
      setShowDuplicateDetails(false);
    } catch (uploadError: any) {
      setError(uploadError?.message || "Unable to upload files.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex justify-end">
        <Link href="/users/admin" className="btn-secondary">
          Back to Admin
        </Link>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <h1 className="mb-3 text-2xl font-semibold">Bulk CSV Upload</h1>
        <p className="mb-5 text-sm text-slate-600">
          Drag CSV files here or click to choose files. The files will be saved so they can be read later from Supabase.
        </p>

        <div className="mb-6 text-left rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900 shadow-sm">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="w-full">
              <h3 className="font-semibold text-blue-900 mb-1">Required CSV Column Headings</h3>
              <p className="text-xs text-blue-800 mb-3">Please ensure your CSV file includes these exact column headers:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <span className="bg-white/80 border border-blue-200 px-2.5 py-1.5 rounded-lg text-slate-800 font-semibold shadow-xs">Name</span>
                <span className="bg-white/80 border border-blue-200 px-2.5 py-1.5 rounded-lg text-slate-800 font-semibold shadow-xs">First Name</span>
                <span className="bg-white/80 border border-blue-200 px-2.5 py-1.5 rounded-lg text-slate-800 font-semibold shadow-xs">Last Name</span>
                <span className="bg-white/80 border border-blue-200 px-2.5 py-1.5 rounded-lg text-slate-800 font-semibold shadow-xs">Illinois Email</span>
                <span className="bg-white/80 border border-blue-200 px-2.5 py-1.5 rounded-lg text-slate-800 font-semibold shadow-xs">Year</span>
                <span className="bg-white/80 border border-blue-200 px-2.5 py-1.5 rounded-lg text-slate-800 font-semibold shadow-xs">College</span>
                <span className="bg-white/80 border border-blue-200 px-2.5 py-1.5 rounded-lg text-slate-800 font-semibold shadow-xs">Major</span>
                <span className="bg-white/80 border border-blue-200 px-2.5 py-1.5 rounded-lg text-slate-800 font-semibold shadow-xs">Committee</span>
              </div>
            </div>
          </div>
        </div>

        <label
          htmlFor="csv-upload"
          className="inline-block w-full cursor-pointer rounded-xl bg-white px-5 py-8 text-slate-700 shadow-sm transition hover:bg-slate-100"
          onDragOver={preventDefault}
          onDrop={handleDrop}
        >
          <input
            id="csv-upload"
            type="file"
            accept=".csv,text/csv"
            multiple
            className="hidden"
            onChange={handleBrowse}
          />
          <div className="space-y-3">
            <p className="text-base font-medium">Drop CSV files here</p>
            <p className="text-sm text-slate-500">or click to select from your computer.</p>
          </div>
        </label>
      </div>

      {uploads.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Files to upload</h2>
          <ul className="space-y-2">
            {uploads.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{entry.file.name}</p>
                  <p className="text-sm text-slate-500">{(entry.file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(entry.id)}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleUpload}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-5 py-3 text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Uploading..." : "Upload CSV files"}
        </button>
        <button
          type="button"
          onClick={handlePopulate}
          disabled={!hasUploaded || populating || loading}
          className="rounded-xl bg-blue-600 px-5 py-3 text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {populating ? "Populating..." : "Populate Database"}
        </button>
        <button
          type="button"
          onClick={() => setUploads([])}
          disabled={uploads.length === 0 || loading || populating}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear list
        </button>
      </div>

      {message && <p className="rounded-xl bg-emerald-100 px-4 py-3 text-emerald-800">{message}</p>}
      {error && <p className="rounded-xl bg-rose-100 px-4 py-3 text-rose-800">{error}</p>}

      {existingRows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <button
            type="button"
            onClick={() => setShowDuplicateDetails((current) => !current)}
            className="flex w-full items-center justify-between rounded-xl bg-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-200"
          >
            <span>Show duplicate entries that were not added</span>
            <span>{showDuplicateDetails ? "▲" : "▼"}</span>
          </button>

          {showDuplicateDetails && (
            <div className="mt-4 space-y-3">
              {existingRows.map((row) => (
                <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{row.name} ({row.illinois_email})</p>
                  <p className="text-sm text-slate-600">{row.first_name} {row.last_name}</p>
                  <p className="text-sm text-slate-600">{row.college} · {row.year} · {row.major} · {row.committee}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {missingCount > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
            {missingCount} row(s) had missing fields and were inserted with null values
          </div>
          <div className="mt-4 space-y-2">
            {missingDetails.map((detail) => (
              <div key={`${detail.row}-${detail.missingFields.join(",")}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                <div className="font-semibold text-slate-900">Row {detail.row}</div>
                <div>Missing fields: {detail.missingFields.join(", ")}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

