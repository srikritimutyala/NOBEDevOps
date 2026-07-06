function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendEmail(to: string, subject: string, message: string) {
  const gasUrl = process.env.GAS_EMAIL_URL;
  const gasSecret = process.env.GAS_EMAIL_SECRET;

  if (!gasUrl || !gasSecret) {
    throw new Error("Email service not configured");
  }

  const html = `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`;

  const response = await fetch(gasUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html, secret: gasSecret }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GAS email send failed: ${errorBody}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Failed to send email");
  }
}