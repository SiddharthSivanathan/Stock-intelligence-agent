/**
 * Email notifier — SMTP if SMTP_HOST is set, else console.
 * Used by alert evaluator + portfolio (future).
 */
import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";

let transporter: Transporter | null = null;

function getTransport(): Transporter | null {
  if (!config.SMTP_HOST) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    requireTLS: config.SMTP_USE_TLS,
    auth:
      config.SMTP_USERNAME && config.SMTP_PASSWORD
        ? { user: config.SMTP_USERNAME, pass: config.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  const t = getTransport();
  if (!t) {
    console.log(`[EMAIL → ${to}] ${subject}\n${body}\n`);
    return;
  }
  try {
    await t.sendMail({
      from: config.SMTP_FROM || config.SMTP_USERNAME,
      to,
      subject,
      text: body,
    });
  } catch (e) {
    console.error(`SMTP send failed: ${(e as Error).message}`);
  }
}
