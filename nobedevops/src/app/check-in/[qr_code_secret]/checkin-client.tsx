"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/app/utils/supabase/client";

export default function CheckInClient() {
  const params = useParams();
  const qr_code_secret = params?.qr_code_secret as string | undefined;
  const router = useRouter();
  const supabase = createClient();

  const [message, setMessage] = useState("Checking your login...");
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkIn() {
      if (!qr_code_secret) {
        setMessage("No QR code secret provided.");
        setHasSession(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("You need to log in before checking in.");
        setHasSession(false);
        return;
      }

      setHasSession(true);
      setMessage("Checking you in...");

      try {
        const res = await fetch("/api/check-in", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ qr_code_secret }),
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

    checkIn();
  }, [qr_code_secret, supabase]);

  if (hasSession === false) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-xl border p-6 shadow-sm text-center">
          <h1 className="text-xl font-semibold mb-3">Event Check-In</h1>
          <p className="text-sm text-gray-600 mb-4">{message}</p>
          <button
            onClick={() =>
              router.replace(`/users/login?redirect=/check-in/${qr_code_secret}`)
            }
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white font-medium"
          >
            Log in to continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-xl border p-6 shadow-sm text-center">
        <h1 className="text-xl font-semibold mb-3">Event Check-In</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}