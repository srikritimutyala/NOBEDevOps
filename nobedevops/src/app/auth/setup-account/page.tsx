"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";

export default function SetupAccountPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const [stage, setStage] = useState<"ready" | "verifying" | "setPassword" | "error">("ready");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!tokenHash || !type) {
      setStage("error");
      setErrorMsg("This link is missing required information.");
    }
  }, [tokenHash, type]);

  async function handleVerify() {
    if (!tokenHash || !type) return;
    setStage("verifying");
    setErrorMsg(null);

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as any,
    });

    if (error) {
      setStage("error");
      setErrorMsg(error.message);
      return;
    }

    setStage("setPassword");
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const { error } = await supabase.auth.updateUser({ password });

    setSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    router.push("/users/admin");
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <p className="eyebrow">Account Setup</p>
        <h1 className="page-title" style={{ fontSize: "2rem", textAlign: "center", marginBottom: "8px" }}>
          Welcome to NOBE
        </h1>

        {stage === "ready" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
                <p className="page-subtitle" style={{ textAlign: "center" }}>
                Click below to verify your invite and set up your account.
                </p>
                <button onClick={handleVerify} className="btn button-full">
                Set Up My Account
                </button>
            </div>
        )}

        {stage === "verifying" && <p className="text-center">Verifying your invite...</p>}

        {stage === "setPassword" && (
            <form onSubmit={handleSetPassword} className="field-group" style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "12px" }}>
                <div className="field-group">
                <label className="field-label">Create a password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="field-input"
                />
                </div>
                <div className="field-group">
                <label className="field-label">Confirm password</label>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="field-input"
                />
                </div>
                {errorMsg && <div className="message-error">{errorMsg}</div>}
                <button type="submit" disabled={submitting} className="btn button-full">
                {submitting ? "Saving..." : "Set Password & Continue"}
                </button>
            </form>
        )}

        {stage === "error" && (
          <div className="message-error" style={{ textAlign: "center" }}>
            {errorMsg || "This invite link is invalid or has expired."}
          </div>
        )}
      </div>
    </div>
  );
}