/**
 * Outbound email.
 *
 * Uses Resend's HTTP API rather than SMTP, so this needs no npm package — just
 * fetch and an API key. Set RESEND_API_KEY and MAIL_FROM to turn it on.
 *
 * With no key configured nothing is sent, and that is reported honestly to the
 * caller: the code is written to the server log so the account can still be
 * finished by hand, and the UI tells the user their code did not go out rather
 * than claiming an email is on its way.
 */
export interface SendResult {
  delivered: boolean;
  /** Set when delivery did not happen, for logging and for the UI to explain. */
  reason?: string;
}

const FROM = process.env.MAIL_FROM ?? "LoadReady <onboarding@resend.dev>";
const APP_NAME = "LoadReady";

export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function otpHtml(code: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#111">Confirm your ${APP_NAME} account</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#555">
        Enter this code in the app to finish creating your account.
      </p>
      <div style="font-size:34px;font-weight:700;letter-spacing:10px;text-align:center;
                  padding:18px;background:#f5f5f5;border-radius:12px;color:#111">${code}</div>
      <p style="margin:24px 0 0;font-size:13px;color:#777">
        The code expires in 10 minutes. If you did not ask for it, ignore this email.
      </p>
    </div>
  </body>
</html>`;
}

/**
 * Sends one message, or explains why it could not.
 *
 * `fallbackLog` is what gets written when no provider is configured, so a
 * developer or an administrator can still finish the flow by hand. It must
 * never contain anything that would be dangerous in a log a wider audience can
 * read — a one-time code is acceptable, a password would not be.
 */
async function send(
  to: string,
  subject: string,
  html: string,
  fallbackLog: string,
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Not an error — just an unconfigured deployment.
    console.warn(`[mail] RESEND_API_KEY is not set — no email sent.\n[mail] ${fallbackLog}`);
    return { delivered: false, reason: "Email delivery is not configured on this server." };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[mail] Resend refused the send (${res.status}): ${detail}`);
      return { delivered: false, reason: "The email provider rejected the message." };
    }
    return { delivered: true };
  } catch (err) {
    console.error("[mail] could not reach the email provider:", err);
    return { delivered: false, reason: "Could not reach the email provider." };
  }
}

export async function sendOtpEmail(to: string, code: string): Promise<SendResult> {
  return send(
    to,
    `Your ${APP_NAME} verification code: ${code}`,
    otpHtml(code),
    `Verification code for ${to}: ${code}`,
  );
}

/**
 * A reset link, not a code: the link carries a long random token, so there is
 * nothing short enough to be worth guessing.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  fullName?: string,
): Promise<SendResult> {
  const greeting = fullName ? `Hello ${escapeHtml(fullName)},` : "Hello,";
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#111">Reset your ${APP_NAME} password</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#555">${greeting}</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555">
        Use the button below to choose a new password. The link works once and expires in an hour.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;padding:14px 24px;border-radius:9999px;background:#C99700;color:#fff;font-weight:600;text-decoration:none">
        Choose a new password
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#777">
        If you did not ask for this, you can ignore it — your password stays as it is.
      </p>
    </div>
  </body>
</html>`;

  return send(
    to,
    `Reset your ${APP_NAME} password`,
    html,
    `Password reset link for ${to}: ${resetUrl}`,
  );
}

/**
 * Someone tried to sign up with an address that already has an account.
 *
 * The person at the keyboard is told nothing either way, so this is how the
 * real owner finds out. It offers the two things they would actually want —
 * sign in, or reset the password — and never says who tried.
 */
export async function sendSignupOnExistingAccountEmail(
  to: string,
  signInUrl: string,
): Promise<SendResult> {
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#111">You already have a ${APP_NAME} account</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#555">
        Someone just tried to create an account with this email address. If that was you, there is
        no need — you can sign in with the password you already have, or reset it if you have
        forgotten it.
      </p>
      <a href="${signInUrl}"
         style="display:inline-block;padding:14px 24px;border-radius:9999px;background:#C99700;color:#fff;font-weight:600;text-decoration:none">
        Sign in
      </a>
      <p style="margin:24px 0 0;font-size:13px;color:#777">
        If it was not you, nothing has changed and no new account was created. You do not need to
        do anything.
      </p>
    </div>
  </body>
</html>`;

  return send(
    to,
    `You already have a ${APP_NAME} account`,
    html,
    `Signup attempted on the existing account ${to} — no code sent.`,
  );
}

/** Names go into HTML, so they get escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A notification, as email.
 *
 * Plain and short on purpose: these arrive while somebody is driving, and the
 * useful version is one they can read from the notification shade without
 * opening anything. The app is where the detail lives.
 */
export async function sendNotificationEmail(
  to: string,
  subject: string,
  body: string,
): Promise<SendResult> {
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 12px;font-size:19px;color:#111">${escapeHtml(subject)}</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.5">${escapeHtml(body)}</p>
      <p style="margin:0;font-size:13px;color:#777">
        Open ${APP_NAME} to see it. You can change which of these you get in Preferences.
      </p>
    </div>
  </body>
</html>`;

  return send(to, subject, html, `Notification for ${to}: ${subject}`);
}
