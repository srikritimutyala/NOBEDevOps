"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function CheckInClient() {
  const params = useParams();
  const qr_code_secret = params?.qr_code_secret as string | undefined;

  const [message, setMessage] = useState("logging u in");

  useEffect(() => {
    if (!qr_code_secret) {
      setMessage("nope No QR code secret provided.");
      return;
    }

    async function checkIn() {
      try {
        const res = await fetch("/api/check-in", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ qr_code_secret }),
        });

        const data = await res.json();
        console.log("data", data);

        if (data.ok) {
          setMessage(`checked in to ${data.event_name}`);
        } else {
          setMessage(`nope ${data.message}`);
        }
      } catch (error) {
        setMessage("something went wrong server side");
      }
    }

    checkIn();
  }, [qr_code_secret]);

  return <p>{message}</p>;
}