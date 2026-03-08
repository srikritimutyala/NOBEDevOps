import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { to, subject, message } = await request.json();

    // Validate input
    if (!to || !subject || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, message" },
        { status: 400 }
      );
    }

    // Use Resend to send email
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not configured");
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev", // Replace with your verified domain
        to: to,
        subject: subject,
        html: `<p>${message.replace(/\n/g, "<br>")}</p>`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Email send failed:", errorData);
      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json(
      { success: true, messageId: data.id },
      { status: 200 }
    );
  } catch (error) {
    console.error("Email API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
