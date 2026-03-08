import CheckInClient from "./checkin-client";

export default function CheckInPage({
  params,
}: {
  params: { qr_code_secret: string };
}) {
  const { qr_code_secret } = params;

  return (
    <div style={{ padding: "24px", textAlign: "center" }}>
      <h2>Event Check-In</h2>

      <p>Processing your check-in...</p>

      <CheckInClient qr_code_secret={qr_code_secret} />
    </div>
  );
}