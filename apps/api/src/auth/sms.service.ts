import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { ENV } from '../core/tokens.js';

/** SMS delivery: `console` logs the message (dev), `twilio` sends it. */
@Injectable()
export class SmsService {
  private readonly log = new Logger('SMS');

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(to: string, body: string) {
    if (this.env.SMS_PROVIDER !== 'twilio') {
      this.log.log(`[console] to=${to} body="${body}"`);
      return;
    }
    const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_PHONE_NUMBER: from } = this.env;
    if (!sid || !token || !from) throw new Error('SMS_PROVIDER=twilio but Twilio credentials are missing');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(data.message || `Twilio SMS failed with status ${res.status}`);
    }
  }
}
