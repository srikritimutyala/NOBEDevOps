"use client";

import { useEffect, useState } from "react";

export default function CheckInClient({
  qr_code_secret,
}: {
  qr_code_secret: string;
}) {
  const [message, setMessage] = useState("logging u in");

  useEffect(() => {
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