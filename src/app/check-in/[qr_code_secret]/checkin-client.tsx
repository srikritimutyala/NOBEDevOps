"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/utils/supabase/client";

interface CheckInProgress {
  is_PM?: boolean;
  role?: string;
  isExempt?: boolean;
  professional_points?: number;
  service_points?: number;
  social_points?: number;
  pooled_points?: number;
  total_points?: number;
  professional_goal?: number;
  service_social_goal?: number;
  service_goal?: number;
  social_goal?: number;
  total_goal?: number;
  name?: string;
  first_name?: string;
}

interface CheckInResponse {
  ok: boolean;
  already_checked_in?: boolean;
  message?: string;
  event_name?: string;
  points_awarded?: number;
  point_type?: string;
  progress?: CheckInProgress;
}

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
  const [checkInResult, setCheckInResult] = useState<CheckInResponse | null>(null);

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
        if (data.progress) {
          setCheckInResult(data);
          setMessage(data.message || "You have already checked in.");
          return;
        }
        setMessage(data.message || "Check-in failed.");
        return;
      }

      setCheckInResult(data);
      setMessage(data.message || `Checked in to ${data.event_name}!`);
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
        <div className="auth-card" style={{ maxWidth: "480px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "16px" }}>
            <img
              src="/nobe_logo_f.svg"
              alt="NOBE Illinois"
              style={{ width: "52px", height: "52px", marginBottom: "10px" }}
            />
            <p className="eyebrow" style={{ marginBottom: "4px" }}>Event Access</p>
            <h1 className="page-title" style={{ fontSize: "2rem", textAlign: "center" }}>Event Check-In</h1>
            <p className="page-subtitle" style={{ textAlign: "center", marginTop: "6px" }}>
              Sign in to record your attendance.
            </p>
          </div>

          {authError && (
            <div className="message-error" style={{ marginBottom: "16px" }}>
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
                placeholder="netid@illinois.edu"
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
              style={{ marginTop: "8px" }}
            >
              {submitting ? "Signing in..." : "Sign In & Check In"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const progress = checkInResult?.progress;
  const isPM = Boolean(progress?.is_PM);
  const isAdmin = progress?.role?.toUpperCase() === "ADMIN" || Boolean(progress?.isExempt);

  const profPoints = Number(progress?.professional_points ?? 0);
  const servPoints = Number(progress?.service_points ?? 0);
  const socPoints = Number(progress?.social_points ?? 0);
  const pooledPoints = Number(progress?.pooled_points ?? (servPoints + socPoints));
  const totalPoints = Number(progress?.total_points ?? (profPoints + pooledPoints));

  // Determine goals based on PM status (4 prof + 4 pooled for PM, 5 prof + 5 pooled for regular Member)
  const profGoal = isAdmin ? 0 : (isPM ? 4 : Number(progress?.professional_goal ?? 5));
  const pooledGoal = isAdmin ? 0 : (isPM ? 4 : Number(progress?.service_social_goal ?? 5));
  const totalGoal = isAdmin ? 0 : (isPM ? 8 : Number(progress?.total_goal ?? 10));

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: "520px", padding: "32px 28px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "20px" }}>
          <img
            src="/nobe_logo_f.svg"
            alt="NOBE Illinois"
            style={{ width: "52px", height: "52px", marginBottom: "8px" }}
          />
          <h1 className="page-title" style={{ fontSize: "1.9rem", textAlign: "center" }}>Event Check-In</h1>
        </div>

        {!checkInResult ? (
          <div className="text-center" style={{ padding: "24px 0" }}>
            <p className="section-copy" style={{ fontSize: "1rem" }}>{message}</p>
            {message !== "Checking your login..." && message !== "Checking you in..." && (
              <div style={{ marginTop: "20px" }}>
                <Link
                  href="/users/member"
                  className="btn"
                  style={{ textDecoration: "none", display: "inline-block", padding: "10px 20px" }}
                >
                  Go to Member Portal
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Event status banner */}
            <div
              style={{
                padding: "14px 18px",
                borderRadius: "20px",
                textAlign: "center",
                background: checkInResult.already_checked_in
                  ? "rgba(229, 138, 39, 0.12)"
                  : "rgba(63, 122, 83, 0.12)",
                border: checkInResult.already_checked_in
                  ? "1px solid rgba(229, 138, 39, 0.28)"
                  : "1px solid rgba(63, 122, 83, 0.28)",
              }}
            >
              <p
                style={{
                  fontWeight: 800,
                  fontSize: "1.05rem",
                  color: checkInResult.already_checked_in ? "#b45309" : "#29583b",
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                }}
              >
                {checkInResult.already_checked_in ? "⚠️ Already Checked In" : "✓ Attendance Confirmed"}
              </p>
              <p
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: "var(--foreground)",
                  marginTop: "6px",
                  marginBottom: "2px",
                }}
              >
                {checkInResult.event_name}
              </p>
              <p style={{ fontSize: "0.84rem", color: "var(--muted)", margin: 0 }}>
                {checkInResult.message}
              </p>
            </div>

            {/* Event points awarded card */}
            <div
              className="subtle-card"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
              }}
            >
              <div>
                <p className="stat-label" style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {checkInResult.already_checked_in ? "Event Points" : "Points Earned"}
                </p>
                <p style={{ fontWeight: 700, fontSize: "1.05rem", margin: "2px 0 0" }}>
                  {checkInResult.point_type ? checkInResult.point_type.replaceAll("_", " ") : "Event Point"}
                </p>
                {checkInResult.points_awarded === 0 && (
                  <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "2px 0 0", fontWeight: 500 }}>
                    Mandatory attendance recorded (0 pts)
                  </p>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <span
                  style={{
                    fontSize: "1.7rem",
                    fontWeight: 800,
                    color: "var(--accent-strong)",
                  }}
                >
                  +{checkInResult.points_awarded ?? 0}
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--muted)", marginLeft: "4px", fontWeight: 600 }}>
                  pt{(checkInResult.points_awarded === 1 ? "" : "s")}
                </span>
              </div>
            </div>

            {/* Member Track / Role Badge */}
            {isAdmin ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "18px",
                  background: "rgba(147, 51, 234, 0.08)",
                  border: "1px solid rgba(147, 51, 234, 0.2)",
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      background: "rgba(147, 51, 234, 0.16)",
                      color: "#7e22ce",
                      padding: "3px 9px",
                      borderRadius: "10px",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    Officer / Admin
                  </span>
                  <p style={{ fontSize: "0.8rem", color: "#6b21a8", margin: "4px 0 0", fontWeight: 500 }}>
                    Exempt from point requirements & strikes
                  </p>
                </div>
              </div>
            ) : isPM ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "18px",
                  background: "rgba(147, 51, 234, 0.08)",
                  border: "1px solid rgba(147, 51, 234, 0.22)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        background: "rgba(147, 51, 234, 0.18)",
                        color: "#7e22ce",
                        padding: "3px 9px",
                        borderRadius: "10px",
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      Pledge Member (PM)
                    </span>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#7e22ce" }}>
                      4 + 4 Track
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "#6b21a8", margin: "4px 0 0", fontWeight: 500 }}>
                    Goal: 4 Professional + 4 Pooled Service/Social (8 pts total)
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "#7e22ce" }}>
                    {totalGoal}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#7e22ce", display: "block", fontWeight: 600 }}>
                    pts goal
                  </span>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  borderRadius: "18px",
                  background: "rgba(229, 138, 39, 0.08)",
                  border: "1px solid rgba(229, 138, 39, 0.22)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        background: "rgba(229, 138, 39, 0.18)",
                        color: "var(--accent-strong)",
                        padding: "3px 9px",
                        borderRadius: "10px",
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                      }}
                    >
                      Active Member
                    </span>
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-strong)" }}>
                      5 + 5 Track
                    </span>
                  </div>
                  <p style={{ fontSize: "0.8rem", color: "var(--foreground)", margin: "4px 0 0", fontWeight: 500 }}>
                    Goal: 5 Professional + 5 Pooled Service/Social (10 pts total)
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--accent-strong)" }}>
                    {totalGoal}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block", fontWeight: 600 }}>
                    pts goal
                  </span>
                </div>
              </div>
            )}

            {/* Point Progress Breakdown */}
            {progress && (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 className="section-title" style={{ fontSize: "1.1rem" }}>Point Progress</h2>
                  {!isAdmin && (
                    <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--muted)" }}>
                      Total: {totalPoints} / {totalGoal} pts
                    </span>
                  )}
                </div>

                {/* Professional Points */}
                <PointProgressRow
                  label="💼 Professional Points"
                  value={profPoints}
                  goal={profGoal}
                  isExempt={isAdmin}
                  accentColor="var(--accent)"
                />

                {/* Service and Social Pooled Points */}
                <PointProgressRow
                  label="🤝 + 🎉 Service & Social (Pooled)"
                  value={pooledPoints}
                  goal={pooledGoal}
                  isExempt={isAdmin}
                  accentColor="#3b82f6"
                  detail={
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 12px",
                        borderRadius: "10px",
                        background: "rgba(79, 80, 82, 0.06)",
                        marginTop: "8px",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>Pooled Breakdown:</span>
                      <span style={{ fontWeight: 700, color: "var(--foreground)" }}>
                        {servPoints} Service · {socPoints} Social
                      </span>
                    </div>
                  }
                />

                {/* Total Points Overview */}
                {!isAdmin && (
                  <PointProgressRow
                    label="⭐ Total Points"
                    value={totalPoints}
                    goal={totalGoal}
                    isExempt={isAdmin}
                    accentColor="#8a6250"
                  />
                )}
              </div>
            )}

            {/* Link to Member Portal */}
            <div style={{ marginTop: "12px" }}>
              <Link
                href="/users/member"
                className="btn button-full"
                style={{
                  textAlign: "center",
                  textDecoration: "none",
                  display: "block",
                  padding: "13px",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                }}
              >
                Go to Member Dashboard →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PointProgressRow({
  label,
  value,
  goal,
  isExempt = false,
  detail,
  accentColor = "var(--accent)",
}: {
  label: React.ReactNode;
  value: number;
  goal: number;
  isExempt?: boolean;
  detail?: React.ReactNode;
  accentColor?: string;
}) {
  const isMet = !isExempt && value >= goal;
  const percent = isExempt ? 100 : goal > 0 ? Math.min(Math.round((value / goal) * 100), 100) : 0;
  const needed = Math.max(goal - value, 0);

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: "18px",
        background: "rgba(255, 251, 247, 0.8)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <span style={{ fontWeight: 650, fontSize: "0.92rem", color: "var(--foreground)" }}>
          {label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isExempt ? (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "#7e22ce",
                background: "rgba(147, 51, 234, 0.12)",
                padding: "2px 7px",
                borderRadius: "8px",
              }}
            >
              Exempt
            </span>
          ) : isMet ? (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--success)",
                background: "rgba(63, 122, 83, 0.12)",
                padding: "2px 7px",
                borderRadius: "8px",
              }}
            >
              ✓ Met
            </span>
          ) : (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "var(--muted)",
                background: "rgba(107, 108, 112, 0.1)",
                padding: "2px 7px",
                borderRadius: "8px",
              }}
            >
              {needed} needed
            </span>
          )}
          <span style={{ fontWeight: 750, fontSize: "0.95rem" }}>
            {value}{" "}
            <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>
              {isExempt ? "pts" : `/ ${goal} pts`}
            </span>
          </span>
        </div>
      </div>

      {!isExempt && (
        <div
          className="w-full h-2.5 rounded-full overflow-hidden"
          style={{ background: "rgba(79, 80, 82, 0.12)" }}
        >
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${percent}%`,
              backgroundColor: isMet ? "var(--success)" : accentColor,
            }}
          />
        </div>
      )}

      {detail}
    </div>
  );
}

