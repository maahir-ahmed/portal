import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
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

export function notificationEmail(title: string, body: string, link?: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const cta = link
    ? `<p><a href="${appUrl}${link}" style="background:#0052CC;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">View Details</a></p>`
    : "";

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0052CC;padding:20px;border-radius:8px 8px 0 0;">
        <h1 style="color:white;margin:0;font-size:20px;">${process.env.NEXT_PUBLIC_APP_NAME ?? "Society Platform"}</h1>
      </div>
      <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 12px;color:#111827;">${escapeHtml(title)}</h2>
        <p style="color:#374151;line-height:1.6;">${escapeHtml(body)}</p>
        ${cta}
      </div>
    </div>
  `;
}
