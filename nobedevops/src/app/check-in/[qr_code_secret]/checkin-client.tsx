"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";

export default function CheckInClient() {
  const params = useParams();
  const qr_code_secret = params?.qr_code_secret as string | undefined;
  const supabase = createClient();

  const [message, setMessage] = useState("Checking your login...");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkInResult, setCheckInResult] = useState<any | null>(null);

  async function runCheckIn(secret: string) {
    setMessage("Checking you in...");

    try {
      const res = await fetch("/api/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ qr_code_secret: secret }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.message || "Check-in failed.");
        return;
      }

      setCheckInResult(data);
      setMessage(`Checked in to ${data.event_name}!`);
    } catch {
      setMessage("Something went wrong during check-in.");
    }
  }

  useEffect(() => {
    async function init() {
      if (!qr_code_secret) {
        setMessage("No QR code secret provided.");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setNeedsLogin(true);
        setMessage("Please sign in to continue.");
        return;
      }

      await runCheckIn(qr_code_secret);
    }

    init();
  }, [qr_code_secret, supabase]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setAuthError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    setNeedsLogin(false);

    if (qr_code_secret) {
      await runCheckIn(qr_code_secret);
    }
  }

  if (needsLogin) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <p className="eyebrow">Event Access</p>
          <h1 className="page-title" style={{ fontSize: "2.25rem", textAlign: "center" }}>Event Check-In</h1>
          <p className="page-subtitle" style={{ textAlign: "center" }}>
            Sign in to complete your check-in.
          </p>

          {authError && (
            <div className="message-error">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="field-group">
            <div className="field-group">
              <label className="field-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="field-input"
              />
            </div>

            <div className="field-group">
              <label className="field-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="field-input"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn button-full"
            >
              {submitting ? "Signing in..." : "Sign in and check in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: "520px" }}>
        <h1 className="page-title" style={{ fontSize: "2.25rem", textAlign: "center", marginBottom: "12px" }}>Event Check-In</h1>

        {!checkInResult ? (
          <p className="text-center">{message}</p>
        ) : (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-lg font-semibold">{checkInResult.event_name}</p>
              <p className="section-copy">{checkInResult.message}</p>
            </div>

            <div className="subtle-card space-y-2">
              <p>
                <span className="font-medium">Points earned:</span>{" "}
                {checkInResult.points_awarded}
              </p>
              <p>
                <span className="font-medium">Point type:</span>{" "}
                {checkInResult.point_type}
              </p>
            </div>

            {checkInResult.progress && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Your Point Progress</h2>

                <ProgressRow
                  label="Professional"
                  value={checkInResult.progress.professional_points ?? 0}
                  goal={10}
                />
                <ProgressRow
                  label="Service"
                  value={checkInResult.progress.service_points ?? 0}
                  goal={5}
                />
                <ProgressRow
                  label="Social"
                  value={checkInResult.progress.social_points ?? 0}
                  goal={5}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  goal,
}: {
  label: string;
  value: number;
  goal: number;
}) {
  const percent = Math.min((value / goal) * 100, 100);

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span>
          {value} / {goal}
        </span>
      </div>
      <div
        className="w-full h-3 rounded-full overflow-hidden"
        style={{ background: "rgba(106, 68, 51, 0.14)" }}
      >
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            background: "linear-gradient(90deg, #6a4433 0%, #8a6250 100%)",
          }}
        />
      </div>
    </div>
  );
}
