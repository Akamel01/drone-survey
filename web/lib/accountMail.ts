// Sign-in mail (#247): the verification link and the password reset link.
//
// Where mail goes is decided per call, from the environment:
//   RESEND_API_KEY + EMAIL_FROM -- Resend, the production sender.
//   AUTH_TEST_MAIL_DIR          -- tests only: each mail is written as a JSON
//                                  file there (the end-to-end suite's inbox).
//                                  Ignored on Vercel, like every AUTH_TEST_*.
//   neither                     -- no mail: email sign-in is off, the option
//                                  is hidden on the home page and Better Auth
//                                  refuses its email endpoints.
//
// Relative imports carry the explicit .ts extension (accountEnv/accountDb
// discipline).

import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type MailSink = "resend" | "test-dir" | null;

export function mailSink(): MailSink {
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "resend";
  if (process.env.AUTH_TEST_MAIL_DIR && !process.env.VERCEL_ENV) return "test-dir";
  return null;
}

/** Email and password sign-in is on only where its mail can be sent. */
export function emailSignInEnabled(): boolean {
  return mailSink() !== null;
}

export async function sendMail(mail: Mail): Promise<void> {
  const sink = mailSink();
  if (sink === "test-dir") {
    const dir = process.env.AUTH_TEST_MAIL_DIR as string;
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(mail));
    return;
  }
  if (sink === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
    if (!response.ok) throw new Error(`Resend refused the mail (${response.status}).`);
    return;
  }
  throw new Error("Email sign-in is not set up on this deployment.");
}

export function verificationMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Confirm your email for Mission Control",
    text: `Open this link to confirm your email and sign in to Mission Control:\n\n${url}\n\nIf you did not sign up, ignore this message.`,
  };
}

export function resetMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Reset your Mission Control password",
    text: `Open this link to choose a new password for Mission Control:\n\n${url}\n\nIf you did not ask for this, ignore this message; your password stays as it is.`,
  };
}
