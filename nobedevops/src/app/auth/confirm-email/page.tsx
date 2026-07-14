"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";

function ConfirmEmailInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const [stage, setStage] = useState<"ready" | "confirming" | "done" | "error">("ready");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenHash || !type) {
      setStage("error");
      setErrorMsg("This confirmation link is missing required information.");
    }
  }, [tokenHash, type]);

  async function handleConfirm() {
    if (!tokenHash || !type) return;
    setStage("confirming");

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as any,
    });

    if (error) {
      setStage("error");
      setErrorMsg("This confirmation link has expired or is invalid. Please sign up again to get a new one.");
      return;
    }

    setStage("done");
    setTimeout(() => router.push("/users/login?confirmed=1"), 1500);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <img
          src="/nobe_logo_f.svg"
          alt="NOBE Illinois"
          className="brand-logo brand-logo-header"
          style={{ width: '120px', height: '120px' }}
        />
        <h1 className="page-title" style={{ fontSize: "2rem", textAlign: "center", marginBottom: "8px" }}>
          Confirm your email
        </h1>

        {stage === "ready" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
            <p className="page-subtitle" style={{ textAlign: "center" }}>
              Click below to confirm your NOBE Illinois account.
            </p>
            <button onClick={handleConfirm} className="btn button-full">
              Confirm my email
            </button>
          </div>
        )}

        {stage === "confirming" && (
          <p className="page-subtitle" style={{ textAlign: "center", marginTop: "16px" }}>
            Confirming...
          </p>
        )}

        {stage === "done" && (
          <p className="page-subtitle" style={{ textAlign: "center", marginTop: "16px" }}>
            Email confirmed! Redirecting you to sign in...
          </p>
        )}

        {stage === "error" && (
          <div style={{ marginTop: "16px" }}>
            <div className="message-error" style={{ textAlign: "center" }}>
              {errorMsg}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConfirmEmailPage() {
  return (
    <Suspense>
      <ConfirmEmailInner />
    </Suspense>
  );
}
