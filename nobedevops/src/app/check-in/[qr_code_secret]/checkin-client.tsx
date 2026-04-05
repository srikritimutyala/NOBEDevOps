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
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-6">
        <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow">
          <h1 className="text-center text-2xl font-bold text-gray-900">
            Event Check-In
          </h1>

          <p className="text-center text-sm text-gray-700">
            Sign in to complete your check-in.
          </p>

          {authError && (
            <div className="rounded bg-red-100 p-3 text-sm text-red-700">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded bg-blue-600 py-2 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Signing in..." : "Sign in and check in"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-6">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h1 className="mb-3 text-xl font-semibold text-gray-900">
          Event Check-In
        </h1>
        <p className="text-base text-gray-800">{message}</p>
      </div>
    </div>
  );
}