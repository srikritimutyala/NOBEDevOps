"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

export default function CheckInClient() {
  const params = useParams();
  const qr_code_secret = params?.qr_code_secret as string | undefined;
  const router = useRouter();

  const [message, setMessage] = useState("logging u in");

  useEffect(() => {
    if (!qr_code_secret) {
      setMessage("nope No QR code secret provided.");
      return;
    }

async function checkIn() {

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    router.replace("/users/login");
    return;
  }

}

    checkIn();
  }, [qr_code_secret]);

  return <p>{message}</p>;
}