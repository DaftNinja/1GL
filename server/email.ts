const RESEND_API_URL = "https://api.resend.com/emails";

function getResendApiKey(): string {
  const key = process.env.SMTP_PASS;
  if (!key) {
    throw new Error("Email not configured. Set SMTP_PASS (Resend API key) environment variable.");
  }
  return key;
}

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
  const apiKey = getResendApiKey();
  const fromAddress = process.env.SMTP_FROM || "contact@1giglabs.com";

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; background: #f5f7fa; margin: 0; padding: 40px 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <img src="https://1giglabs.com/wp-content/uploads/2024/01/1GigLabs-Logo.png" alt="1GigLabs" style="height: 36px; margin-bottom: 32px;" />
          <h2 style="color: #0f172a; margin: 0 0 12px;">Reset your password</h2>
          <p style="color: #475569; line-height: 1.6; margin: 0 0 24px;">
            We received a request to reset the password for your 1GigLabs account. Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
          </p>
          <a href="${resetUrl}" style="display: inline-block; background: #1976D2; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">Reset Password</a>
          <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">
            If you didn't request this, you can safely ignore this email. Your password won't change.
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            If the button doesn't work, copy and paste this link:<br/>
            <a href="${resetUrl}" style="color: #1976D2; word-break: break-all;">${resetUrl}</a>
          </p>
        </div>
      </body>
    </html>
  `;

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `1GigLabs <${fromAddress}>`,
      to: [toEmail],
      subject: "Reset your 1GigLabs password",
      html,
      text: `Reset your 1GigLabs password\n\nClick this link to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[email] Resend API error:", res.status, body);
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  console.log("[email] Resend sent OK:", data.id);
}
