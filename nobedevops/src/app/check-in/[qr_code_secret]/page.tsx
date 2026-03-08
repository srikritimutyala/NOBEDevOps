import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import CheckInClient from "./checkin-client";
import { createClient } from "@/app/utils/supabase/server";

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ qr_code_secret: string }>;
}) {
  const { qr_code_secret } = await params;
  const supabase = createClient(cookies());

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/check-in/${qr_code_secret}`);
  }

  return (
    <div style={{ padding: "24px", textAlign: "center" }}>
      <h2>Event Check-In</h2>
      <CheckInClient qr_code_secret={qr_code_secret} />
    </div>
  );
}