import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/app/utils/sendEmail";

export async function POST(request: NextRequest) {
  try {
    const { to, subject, message } = await request.json();
    const recipient = to?.trim() || process.env.NEXT_PUBLIC_ADMIN_NOTIFICATION_EMAIL?.trim() || "nobeadmintest@gmail.com";

    if (!recipient || !subject || !message) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, message" },
        { status: 400 }
      );
    }

    await sendEmail(recipient, subject, message);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Email API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}