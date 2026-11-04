import nodemailer from "nodemailer";

const port = Number(process.env.SMTP_PORT ?? 587);
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port,
  // 465 is TLS from the start; anything else must upgrade with STARTTLS, or the
  // password would cross the network in the clear when a server doesn't offer it.
  secure: port === 465,
  requireTLS: port !== 465,
  // A hung mail server must not hold sockets open forever.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
  auth:
    process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
});

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail({ to, subject, html, text }: EmailOptions) {
  if (!process.env.SMTP_HOST) return; // email disabled if not configured

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? "noreply@society.local",
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    html,
    text,
  });
}

// Notification titles and bodies carry member-typed text (event names, dates), so they
// are escaped: unescaped, any member could put a working link or tracking pixel into an
// email that every executive receives from the society's own address.
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function notificationEmail(title: string, body: string, link?: string, label = "View Details") {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const cta = link
    ? `<p><a href="${appUrl}${link}" style="background:#0052CC;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">${label}</a></p>`
    : "";

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0052CC;padding:20px;border-radius:8px 8px 0 0;">
        <h1 style="color:white;margin:0;font-size:20px;">${process.env.NEXT_PUBLIC_APP_NAME ?? "Society Platform"}</h1>
      </div>
      <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 12px;color:#111827;">${escapeHtml(title)}</h2>
        <p style="color:#374151;line-height:1.6;white-space:pre-line;">${escapeHtml(body)}</p>
        ${cta}
      </div>
    </div>
  `;
}

/**
 * Emails a member the temporary passphrase an exec just made for them: a new account,
 * an imported member's first invite, or a reset. Returns whether it went out, so the
 * exec knows to hand it over themselves when it didn't (no SMTP, or the send failed).
 */
export async function emailPassphrase(to: string, name: string, society: string, passphrase: string, reset: boolean) {
  if (!process.env.SMTP_HOST) return false;
  const title = reset ? `Your ${society} portal password was reset` : `You've been added to the ${society} portal`;
  const body =
    `Hi ${name},\n\n` +
    (reset ? "An executive has reset your password. " : `${society} has made you an account on its portal. `) +
    `Sign in with this email address and this temporary passphrase:\n\n${passphrase}\n\n` +
    "You'll choose your own password straight after.";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    await sendEmail({ to, subject: title, html: notificationEmail(title, body, "/login", "Sign in"), text: `${body}\n\n${appUrl}/login` });
    return true;
  } catch (err) {
    console.warn("Passphrase email failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
