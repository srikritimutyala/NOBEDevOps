"use client";

import { Children, type ReactNode, useState } from "react";

export type ReviewAbsenceItem = {
  id: string;
  submitterLabel: string;
  reason: string | null;
  status: string | null;
  submittedAt: string | null;
  adminResponse: string | null;
  reviewedAt: string | null;
  emailSent: boolean | null;
  emailError: string | null;
};

type ReviewFormState = {
  status: "APPROVED" | "DENIED";
  responseMessage: string;
  submitting: boolean;
  error: string;
  success: string;
};

type Props = {
  items: ReviewAbsenceItem[];
};

export default function ReviewAbsenceClient({ items }: Props) {
  const [rows, setRows] = useState(items);
  const [activeSection, setActiveSection] = useState<"PENDING" | "REVIEWED">("PENDING");
  const [forms, setForms] = useState<Record<string, ReviewFormState>>(() =>
    Object.fromEntries(
      items.map((item) => [
        item.id,
        {
          status: normalizeReviewStatus(item.status),
          responseMessage: "",
          submitting: false,
          error: "",
          success: "",
        },
      ])
    )
  );

  function updateForm(id: string, patch: Partial<ReviewFormState>) {
    setForms((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch,
      },
    }));
  }

  async function handleSubmit(absenceId: string) {
    const form = forms[absenceId];

    if (!form) {
      return;
    }

    const trimmedMessage = form.responseMessage.trim();

    if (!trimmedMessage) {
      updateForm(absenceId, {
        error: "A response message is required before sending the review.",
        success: "",
      });
      return;
    }

    updateForm(absenceId, {
      submitting: true,
      error: "",
      success: "",
    });

    try {
      const response = await fetch("/api/admin/review-absence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          absenceId,
          status: form.status,
          responseMessage: trimmedMessage,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        updateForm(absenceId, {
          submitting: false,
          error: payload?.error ?? "Failed to submit review.",
          success: "",
        });
        return;
      }

      setRows((current) =>
        current.map((row) =>
          row.id === absenceId
            ? {
                ...row,
                status: payload?.review?.status ?? form.status,
                adminResponse: payload?.review?.admin_response ?? trimmedMessage,
                reviewedAt: payload?.review?.reviewed_at ?? new Date().toISOString(),
                emailSent: payload?.review?.email_sent ?? payload?.emailSent ?? false,
                emailError: payload?.review?.email_error ?? payload?.emailError ?? null,
              }
            : row
        )
      );
      setActiveSection("REVIEWED");

      updateForm(absenceId, {
        submitting: false,
        responseMessage: "",
        error: "",
        success:
          payload?.emailSent
            ? "Review saved and email sent."
            : "Review saved. Email could not be sent.",
      });
    } catch {
      updateForm(absenceId, {
        submitting: false,
        error: "Unexpected network error while submitting the review.",
        success: "",
      });
    }
  }

  if (rows.length === 0) {
    return (
      <section className="empty-state">
        No absence requests have been submitted yet.
      </section>
    );
  }

  const pendingRows = rows.filter((row) => normalizeStoredStatus(row.status) === "PENDING");
  const reviewedRows = rows.filter((row) => normalizeStoredStatus(row.status) !== "PENDING");
  const visibleRows = activeSection === "PENDING" ? pendingRows : reviewedRows;

  return (
    <section className="page-stack">
      <div className="pill-nav">
        <SectionToggle
          label="Pending"
          count={pendingRows.length}
          active={activeSection === "PENDING"}
          onClick={() => setActiveSection("PENDING")}
        />
        <SectionToggle
          label="Reviewed"
          count={reviewedRows.length}
          active={activeSection === "REVIEWED"}
          onClick={() => setActiveSection("REVIEWED")}
        />
      </div>

      {activeSection === "PENDING" ? (
        <ReviewSection
          description="Requests awaiting an approval or denial."
          emptyText="No pending requests right now."
        >
          {visibleRows.map((item) => {
            const form = forms[item.id];

            return (
              <article
                key={item.id}
                className="panel"
              >
                <div className="panel-header" style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                  <div className="space-y-2">
                    <h2 className="text-lg font-medium">{item.submitterLabel}</h2>
                    <p className="text-sm opacity-80">
                      Submitted {formatTimestamp(item.submittedAt)}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Current status:</span>{" "}
                      {item.status ?? "PENDING"}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      <span className="font-medium">Reason:</span>{" "}
                      {item.reason?.trim() ? item.reason : "No reason provided"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <label className="space-y-2 text-sm">
                    <span className="block font-medium">Decision</span>
                    <select
                      value={form.status}
                      disabled={form.submitting}
                      onChange={(event) =>
                        updateForm(item.id, {
                          status: event.target.value as "APPROVED" | "DENIED",
                        })
                      }
                      className="field-select"
                    >
                      <option value="APPROVED">Approved</option>
                      <option value="DENIED">Disapproved</option>
                    </select>
                  </label>

                  <label className="space-y-2 text-sm">
                    <span className="block font-medium">Response message</span>
                    <textarea
                      value={form.responseMessage}
                      disabled={form.submitting}
                      onChange={(event) =>
                        updateForm(item.id, {
                          responseMessage: event.target.value,
                        })
                      }
                      rows={5}
                      placeholder="Write the message that should be emailed back to the member."
                      className="field-textarea"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-h-5 text-sm">
                    {form.error ? (
                      <p className="message-error">{form.error}</p>
                    ) : form.success ? (
                      <p className="message-success">{form.success}</p>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    disabled={form.submitting}
                    onClick={() => handleSubmit(item.id)}
                    className="btn"
                  >
                    {form.submitting ? "Submitting..." : "Submit review"}
                  </button>
                </div>
              </article>
            );
          })}
        </ReviewSection>
      ) : (
        <ReviewSection
          description="Completed reviews with the saved response and email outcome."
          emptyText="No reviewed requests yet."
        >
          {visibleRows.map((item) => (
            <article
              key={item.id}
              className="panel"
            >
              <div className="space-y-2">
                <h2 className="text-lg font-medium">{item.submitterLabel}</h2>
                <p className="text-sm opacity-80">
                  Submitted {formatTimestamp(item.submittedAt)}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Decision:</span>{" "}
                  {item.status ?? "N/A"}
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  <span className="font-medium">Reason:</span>{" "}
                  {item.reason?.trim() ? item.reason : "No reason provided"}
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  <span className="font-medium">Response message:</span>{" "}
                  {item.adminResponse?.trim() ? item.adminResponse : "No response saved"}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Reviewed at:</span>{" "}
                  {formatTimestamp(item.reviewedAt)}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Email status:</span>{" "}
                  {item.emailSent
                    ? "Sent"
                    : item.emailError?.trim()
                      ? `Not sent - ${item.emailError}`
                      : "Not sent"}
                </p>
              </div>
            </article>
          ))}
        </ReviewSection>
      )}
    </section>
  );
}

function normalizeReviewStatus(status: string | null): "APPROVED" | "DENIED" {
  return status?.trim().toUpperCase() === "DENIED" ? "DENIED" : "APPROVED";
}

function normalizeStoredStatus(status: string | null) {
  const normalized = status?.trim().toUpperCase();

  if (normalized === "APPROVED" || normalized === "DENIED") {
    return normalized;
  }

  return "PENDING";
}

function ReviewSection({
  description,
  emptyText,
  children,
}: {
  description: string;
  emptyText: string;
  children: ReactNode;
}) {
  const items = Children.toArray(children);

  return (
    <section className="panel">
      <p className="section-copy" style={{ marginTop: 0 }}>{description}</p>

      {items.length > 0 ? items : (
        <div className="empty-state">
          {emptyText}
        </div>
      )}
    </section>
  );
}

function SectionToggle({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={active ? "pill-link-active" : "pill-link"}
    >
      <span>{label}</span>
      <span
        className="rounded-full px-2 py-0.5 text-xs"
        style={{
          background: active ? "rgba(255, 250, 246, 0.18)" : "rgba(106, 68, 51, 0.08)",
          color: active ? "#fffaf6" : "var(--foreground)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
