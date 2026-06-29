import { NextRequest, NextResponse } from "next/server";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  try {
    const { to, subject, message } = await request.json();

    if (!to || !subject || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, message" },
        { status: 400 }
      );
    }

    const gasUrl = process.env.GAS_EMAIL_URL;
    const gasSecret = process.env.GAS_EMAIL_SECRET;

    if (!gasUrl || !gasSecret) {
      console.error("GAS email service not configured");
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const html = `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`;

    const response = await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, html, secret: gasSecret }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("GAS email send failed:", errorBody);
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    const data = await response.json();

    if (!data.success) {
      console.error("GAS email error:", data.error);
      return NextResponse.json(
        { error: data.error || "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Email API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
