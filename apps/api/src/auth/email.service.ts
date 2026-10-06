import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { fetchWithTimeout } from '../common/http.js';
import { ENV } from '../core/tokens.js';

const RESEND_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 10_000;

export type EmailCodePurpose = 'verify' | 'reset';

const COPY: Record<EmailCodePurpose, { subject: string; lead: string }> = {
  verify: { subject: 'Verify your MoodFood email', lead: 'Use this code to verify your email address.' },
  reset: { subject: 'Reset your MoodFood password', lead: 'Use this code to reset your password. If you didn’t ask for this, you can ignore this email.' },
};

/** Email delivery: `console` logs the message (dev), `resend` sends it through Resend's API. */
@Injectable()
export class EmailService {
  private readonly log = new Logger('Email');

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(msg: { to: string; subject: string; text: string; html: string }) {
    if (this.env.EMAIL_PROVIDER !== 'resend') {
      this.log.log(`[console] to=${msg.to} subject="${msg.subject}" body="${msg.text.replace(/\s*\n+\s*/g, ' | ')}"`);
      return;
    }
    if (!this.env.RESEND_API_KEY) throw new Error('EMAIL_PROVIDER=resend but RESEND_API_KEY is missing');
    const res = await fetchWithTimeout(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      timeoutMs: SEND_TIMEOUT_MS,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(data.message || `Resend failed with status ${res.status}`);
    }
  }

  /** A 6-digit code email (verification or password reset). */
  sendCode(to: string, purpose: EmailCodePurpose, code: string, ttlMin: number) {
    const { subject, lead } = COPY[purpose];
    const text = `${lead}\n\n${code}\n\nThe code expires in ${ttlMin} minutes.\n\n— MoodFood`;
    const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f1a17">
  <h1 style="font-size:20px;margin:0 0 12px">${subject}</h1>
  <p style="font-size:15px;line-height:1.5;margin:0 0 20px">${lead}</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 20px">${code}</p>
  <p style="font-size:13px;color:#6b625c;margin:0">The code expires in ${ttlMin} minutes.</p>
</div>`;
    return this.send({ to, subject, text, html });
  }
}
