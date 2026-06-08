"use client";

import { useState } from "react";

export default function ProcessStrikesButton() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleProcessStrikes() {
    setIsProcessing(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/process-strikes", {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        if (data.results && data.results.length > 0) {
          const summary = data.results
            .map((r: any) => `${r.event}: ${r.struckCount} strikes`)
            .join(", ");
          setMessage(`Success! Processed: ${summary}`);
        } else {
          setMessage(data.message || "No events to process.");
        }
      } else {
        setMessage(data.error || "Failed to process strikes.");
      }
    } catch (err) {
      setMessage("An error occurred while processing strikes.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleProcessStrikes}
        disabled={isProcessing}
        className="btn-secondary"
        style={{ fontSize: '0.85rem', minHeight: '36px', padding: '0 14px' }}
      >
        {isProcessing ? "Processing..." : "Process Strikes"}
      </button>
      {message && (
        <p className="text-xs mt-1" style={{ color: message.startsWith("Success") ? "green" : "red" }}>
          {message}
        </p>
      )}
    </div>
  );
}
