import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import type { Env } from '../config/env.js';
import { EmailService } from './email.service.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const env = (over: Partial<Env>) => ({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test', EMAIL_FROM: 'MoodFood <no-reply@moodfood.fun>', ...over }) as Env;

test('sends a code email through Resend', async () => {
  let url = '';
  let init: RequestInit = {};
  globalThis.fetch = (async (u: string, i: RequestInit) => {
    url = u;
    init = i;
    return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
  }) as typeof fetch;

  await new EmailService(env({})).sendCode('a@b.co', 'reset', '123456', 15);

  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer re_test');
  const body = JSON.parse(String(init.body));
  assert.deepEqual(body.to, ['a@b.co']);
  assert.equal(body.from, 'MoodFood <no-reply@moodfood.fun>');
  assert.equal(body.subject, 'Reset your MoodFood password');
  assert.match(body.text, /123456/);
  assert.match(body.html, /123456/);
});

test('surfaces Resend errors', async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(new EmailService(env({})).sendCode('a@b.co', 'verify', '000000', 15), /domain not verified/);
});

test('console provider never calls the network', async () => {
  globalThis.fetch = (async () => assert.fail('fetch should not be called')) as typeof fetch;
  await new EmailService(env({ EMAIL_PROVIDER: 'console' })).sendCode('a@b.co', 'verify', '000000', 15);
});
