import nodemailer from "nodemailer";
import { emailSettings, type Smtp } from "./serverSettings";

// Built per send from the current settings, which an executive can change in the app
// (Settings > Email) at any time. Email is rare enough that a fresh connection is fine.
function transport(s: Smtp) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    // 465 is TLS from the start; anything else must upgrade with STARTTLS, or the
    // password would cross the network in the clear when a server doesn't offer it.
    secure: s.port === 465,
    requireTLS: s.port !== 465,
    // A hung mail server must not hold sockets open forever.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
  });
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/** Sends, or quietly does nothing when email is off. Throws when the server refuses. */
export async function sendEmail({ to, subject, html, text }: EmailOptions, settings?: Smtp) {
  const s = settings ?? (await emailSettings());
  if (!s) return;

  await transport(s).sendMail({
    from: s.from,
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
  const settings = await emailSettings();
  if (!settings) return false;
  const title = reset ? `Your ${society} portal password was reset` : `You've been added to the ${society} portal`;
  const body =
    `Hi ${name},\n\n` +
    (reset ? "An executive has reset your password. " : `${society} has made you an account on its portal. `) +
    `Sign in with this email address and this temporary passphrase:\n\n${passphrase}\n\n` +
    "You'll choose your own password straight after.";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  try {
    await sendEmail({ to, subject: title, html: notificationEmail(title, body, "/login", "Sign in"), text: `${body}\n\n${appUrl}/login` }, settings);
    return true;
  } catch (err) {
    console.warn("Passphrase email failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
