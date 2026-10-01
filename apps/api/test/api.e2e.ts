// End-to-end smoke suite against a running API (real Postgres + Redis).
//   docker compose up -d && pnpm --filter @moodfood/api dev
//   API_URL=http://localhost:3001 SYNC_KEY=... pnpm --filter @moodfood/api test:e2e
// Calls to the intelligence service tolerate it being offline.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const BASE = (process.env.API_URL ?? 'http://localhost:3001') + '/api';
const SYNC_KEY = process.env.SYNC_KEY;
const ADMIN = process.env.ADMIN_BASIC ?? 'admin:changeme';

// Unique, valid Indian mobile numbers per run.
const rand = () => String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const newPhone = () => `98${rand()}`;

async function call(method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token && { Authorization: `Bearer ${opts.token}` }),
      ...opts.headers,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

async function signup(name = 'Test User') {
  const phone = newPhone();
  const r = await call('POST', '/auth/signup', { body: { name, phone, password: 'secret123' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { phone, token: r.data.session.token as string, user: r.data.user };
}

describe('health & errors', () => {
  it('reports dependencies', async () => {
    const r = await call('GET', '/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.checks, { database: 'ok', redis: 'ok' });
    assert.ok(r.headers.get('x-request-id'));
  });

  it('uses the { error } shape for 401/404/400', async () => {
    assert.deepEqual((await call('GET', '/user/me')).data, { error: 'No session' });
    assert.equal((await call('GET', '/nope')).status, 404);
    const bad = await call('POST', '/auth/signup', { body: { phone: '123' } });
    assert.equal(bad.status, 400);
    assert.equal(typeof bad.data.error, 'string');
  });

  it('accepts an empty JSON body', async () => {
    const r = await call('POST', '/auth/guest', { headers: { 'Content-Type': 'application/json' } });
    assert.equal(r.status, 201);
  });
});

describe('auth & user management', () => {
  it('signs up, normalises phone formats, and logs in', async () => {
    const { phone, token, user } = await signup();
    assert.match(user.sessionId, /^mfs_/);
    assert.equal(user.phone, `+91${phone}`);

    // Same number, different formatting → same account.
    const dup = await call('POST', '/auth/signup', { body: { name: 'X', phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`, password: 'secret123' } });
    assert.equal(dup.status, 409);

    const bad = await call('POST', '/auth/login', { body: { phone, password: 'wrong-pass' } });
    assert.equal(bad.status, 401);
    const ok = await call('POST', '/auth/login', { body: { phone: `0${phone}`, password: 'secret123' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.id, user.id);

    // v1 header still works.
    const me = await call('GET', '/user/me', { headers: { 'X-Session-Id': token } });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.swiggyLinked, false);
  });

  it('lists and revokes device sessions', async () => {
    const { phone, token } = await signup();
    const second = await call('POST', '/auth/login', { body: { phone, password: 'secret123' } });
    const list = await call('GET', '/auth/sessions', { token });
    assert.equal(list.data.sessions.length, 2);
    const other = list.data.sessions.find((s: { current: boolean }) => !s.current);
    assert.equal((await call('DELETE', `/auth/sessions/${other.id}`, { token })).status, 200);
    assert.equal((await call('GET', '/user/me', { token: second.data.session.token })).status, 401);

    assert.equal((await call('POST', '/auth/logout', { token })).status, 200);
    assert.equal((await call('GET', '/user/me', { token })).status, 401);
  });

  it('updates profile, rejects unverified phone changes, changes password', async () => {
    const { phone, token } = await signup();
    const up = await call('PUT', '/user/me', { token, body: { name: 'Renamed', email: `t${rand()}@example.com` } });
    assert.equal(up.status, 200);
    assert.equal(up.data.user.name, 'Renamed');
    assert.equal((await call('PUT', '/user/me', { token, body: { email: 'nope' } })).status, 400);
    assert.equal((await call('PUT', '/user/me', { token, body: { phone: '9999999999' } })).status, 400);

    const wrong = await call('POST', '/auth/password', { token, body: { currentPassword: 'bad', newPassword: 'newsecret1' } });
    assert.equal(wrong.status, 401);
    const changed = await call('POST', '/auth/password', { token, body: { currentPassword: 'secret123', newPassword: 'newsecret1' } });
    assert.equal(changed.status, 200);
    assert.equal((await call('POST', '/auth/login', { body: { phone, password: 'newsecret1' } })).status, 200);
  });

  it('upgrades a guest account on signup, keeping its data', async () => {
    const guest = await call('POST', '/auth/guest');
    const token = guest.data.session.token;
    assert.equal(guest.data.user.isGuest, true);
    await call('PUT', '/user/preferences', { token, body: { diets: ['veg'], allergies: [], cuisines: [], budget: 2 } });

    const up = await call('POST', '/auth/signup', { token, body: { name: 'Was Guest', phone: newPhone(), password: 'secret123' } });
    assert.equal(up.status, 201);
    assert.equal(up.data.user.id, guest.data.user.id);
    assert.equal(up.data.user.isGuest, false);
    assert.equal((await call('GET', '/user/me', { token })).status, 401, 'guest token revoked');
    const prefs = await call('GET', '/user/preferences', { token: up.data.session.token });
    assert.deepEqual(prefs.data.preferences.diets, ['veg']);
  });

  it('OTP: unknown number needs a name, wrong codes are rejected', async () => {
    const phone = newPhone();
    assert.equal((await call('POST', '/auth/otp/send', { body: { phone } })).status, 200);
    const wrong = await call('POST', '/auth/otp/verify', { body: { phone, otp: '000000' } });
    // 1-in-a-million the random code is 000000; then it's a 404 needsName.
    assert.ok([401, 404].includes(wrong.status));
    assert.equal((await call('POST', '/auth/otp/verify', { body: { phone, otp: '12' } })).status, 400);
  });

  it('deletes the account', async () => {
    const { phone, token } = await signup();
    assert.equal((await call('DELETE', '/user/me', { token })).status, 200);
    assert.equal((await call('GET', '/user/me', { token })).status, 401);
    assert.equal((await call('POST', '/auth/login', { body: { phone, password: 'secret123' } })).status, 401);
  });
});

describe('profile data', () => {
  it('preferences round-trip', async () => {
    const { token } = await signup();
    assert.deepEqual((await call('GET', '/user/preferences', { token })).data.preferences, { diets: [], allergies: [], cuisines: [], budget: 1 });
    const put = await call('PUT', '/user/preferences', { token, body: { diets: ['vegan'], allergies: ['nuts'], cuisines: ['thai'], budget: 3 } });
    assert.deepEqual(put.data.preferences, { diets: ['vegan'], allergies: ['nuts'], cuisines: ['thai'], budget: 3 });
  });

  it('history: create, list by tab, toggle saved; ordering notifies', async () => {
    const { token } = await signup();
    const created = await call('POST', '/user/history', { token, body: { dishName: 'Masala Dosa', priceInr: 180, swiggyOrderId: 'SW1' } });
    assert.equal(created.status, 201);
    await call('POST', '/user/history', { token, body: { dishName: 'Paneer Roll', ordered: false, saved: true } });
    assert.equal((await call('GET', '/user/history?tab=ordered', { token })).data.items.length, 1);
    assert.equal((await call('GET', '/user/history?tab=saved', { token })).data.items.length, 1);
    await call('PATCH', `/user/history/${created.data.id}`, { token, body: { saved: true } });
    assert.equal((await call('GET', '/user/history?tab=saved', { token })).data.items.length, 2);

    const notes = await call('GET', '/user/notifications', { token });
    assert.equal(notes.data.unreadCount, 1);
    assert.equal(notes.data.notifications[0].type, 'order_placed');
    await call('PATCH', `/user/notifications/${notes.data.notifications[0].id}/read`, { token });
    assert.equal((await call('GET', '/user/notifications', { token })).data.unreadCount, 0);
  });

  it('push token validation', async () => {
    const { token } = await signup();
    assert.equal((await call('POST', '/user/notifications/register-push-token', { token, body: { token: 'junk' } })).status, 400);
    const ok = await call('POST', '/user/notifications/register-push-token', { token, body: { token: 'ExponentPushToken[abc-123]' } });
    assert.equal(ok.status, 200);
  });

  it('DIY sessions', async () => {
    const { token } = await signup();
    const created = await call('POST', '/diy', { token, body: { dishName: 'Poha', recipe: { steps: ['a', 'b'] } } });
    assert.equal(created.status, 201);
    await call('PATCH', `/diy/${created.data.id}`, { token, body: { completedSteps: [0, 1], status: 'cooking' } });
    const got = await call('GET', `/diy/${created.data.id}`, { token });
    assert.deepEqual(got.data.session.completedSteps, [0, 1]);
    assert.equal((await call('GET', '/diy', { token })).data.sessions.length, 1);
    const other = await signup();
    assert.equal((await call('GET', `/diy/${created.data.id}`, { token: other.token })).status, 404);
  });
});

describe('personalization', () => {
  it('signals: stores valid ones, drops unknown types', async () => {
    const { token } = await signup();
    const r = await call('POST', '/signals', {
      token,
      body: { signals: [{ type: 'craving', payload: { tags: ['spicy'] } }, { type: 'bogus', payload: {} }] },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.stored, 1);
    assert.equal((await call('POST', '/signals', { token, body: { signals: [{ type: 'bogus', payload: {} }] } })).status, 400);
    assert.equal((await call('POST', '/signals', { token, body: { signals: [] } })).status, 400);
  });

  it('replay feed requires the sync key', async () => {
    const { token, user } = await signup();
    await call('POST', '/signals', { token, body: { signals: [{ type: 'mood_checkin', payload: { mood: 'happy' } }] } });
    assert.equal((await call('GET', `/signals/internal?userId=${user.id}`)).status, 403);
    if (!SYNC_KEY) return;
    const r = await call('GET', `/signals/internal?userId=${user.id}&sinceId=0`, { headers: { 'x-sync-key': SYNC_KEY } });
    assert.equal(r.status, 200);
    assert.equal(r.data.signals[0].type, 'mood_checkin');
    assert.equal(typeof r.data.signals[0].context.time_of_day, 'string');
  });

  it('predictions: create, pending, resolve → post_meal signal', async () => {
    const { token } = await signup();
    const created = await call('POST', '/predictions', { token, body: { recId: 'r1', predictions: [{ dishId: 'd1', dishName: 'Dal', predictedScore: 4 }] } });
    assert.equal(created.status, 201);
    const pending = await call('GET', '/predictions/pending?minAgeMinutes=0', { token });
    assert.equal(pending.data.pending.length, 1);
    const resolved = await call('POST', `/predictions/${created.data.ids[0]}/resolve`, { token, body: { actualScore: 5 } });
    assert.equal(resolved.status, 201);
    assert.equal((await call('GET', '/predictions/pending?minAgeMinutes=0', { token })).data.pending.length, 0);
    assert.equal((await call('POST', `/predictions/${created.data.ids[0]}/resolve`, { token, body: {} })).status, 400);
  });

  it('recommendations answer with or without the intelligence service', async () => {
    const r = await call('POST', '/ai-recommendations', { body: { userContext: { mood: { primary: 'tired' } } } });
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.recommendations) && r.data.recommendations.length > 0);
  });
});

describe('quests & groups', () => {
  it('mood streak counts consecutive days', async () => {
    const { token } = await signup();
    const list = await call('GET', '/quests', { token });
    assert.ok(list.data.quests.some((q: { key: string }) => q.key === 'mood_streak_7'));
    const day = (d: string) => call('POST', '/quests/mood_streak_7/progress', { token, body: { date: d } });
    assert.equal((await day('2026-01-01')).data.streak_count, 1);
    assert.equal((await day('2026-01-01')).data.streak_count, 1);
    assert.equal((await day('2026-01-02')).data.streak_count, 2);
    assert.equal((await day('2026-01-05')).data.streak_count, 1);
    const once = await call('POST', '/quests/adventure_score/progress', { token });
    assert.equal(once.data.status, 'completed');
    assert.equal((await call('POST', '/quests/nope/progress', { token })).status, 404);
  });

  it('group lobby with a guest', async () => {
    const { token } = await signup();
    const { data } = await call('POST', '/groups', { token });
    assert.match(data.code, /^[A-Z2-9]{5}$/);
    const host = await call('POST', `/groups/${data.code}/join`, { token, body: { displayName: 'Host' } });
    const guest = await call('POST', `/groups/${data.code.toLowerCase()}/join`, { body: { displayName: 'Pal' } });
    assert.match(guest.data.memberKey, /^guest_/);
    await call('POST', `/groups/${data.code}/swipe`, { body: { memberKey: guest.data.memberKey, swipes: [{ dish: 'x', liked: true }] } });
    const lobby = await call('GET', `/groups/${data.code}`);
    assert.equal(lobby.data.members.length, 2);
    assert.ok(lobby.data.members.some((m: { swipeCount: number }) => m.swipeCount === 1));
    assert.ok(host.data.memberKey);
    assert.equal((await call('GET', '/groups/ZZZZZ')).status, 404);
  });
});

describe('public & admin', () => {
  it('waitlist + analytics', async () => {
    const before = (await call('GET', '/waitlist/count')).data.count;
    const email = `w${rand()}@example.com`;
    assert.equal((await call('POST', '/waitlist', { body: { name: 'W', email } })).status, 201);
    assert.equal((await call('POST', '/waitlist', { body: { name: 'W', email } })).status, 409);
    assert.equal((await call('GET', '/waitlist/count')).data.count, before + 1);
    assert.equal((await call('POST', '/analytics', { body: { event: 'test_event', properties: { a: 1 } } })).status, 201);
    assert.equal((await call('POST', '/analytics/order-click', { body: { dish_name: 'Dosa' } })).status, 200);
    assert.equal((await call('POST', '/quiz-complete', { body: { mood: 'happy', craving: 'spicy', budget: 'low', preference: 'veg' } })).status, 201);
  });

  it('admin endpoints need credentials', async () => {
    assert.equal((await call('GET', '/admin/analytics')).status, 401);
    const basic = { Authorization: `Basic ${Buffer.from(ADMIN).toString('base64')}` };
    const r = await call('GET', '/admin/analytics', { headers: basic });
    assert.equal(r.status, 200);
    assert.ok(r.data.events.some((e: { event_name: string }) => e.event_name === 'test_event'));
    assert.equal((await call('GET', '/admin/order-clicks', { headers: basic })).status, 200);
    assert.equal((await call('GET', '/admin/waitlist', { headers: basic })).status, 200);
  });

  it('weather validates input', async () => {
    assert.equal((await call('GET', '/weather')).status, 400);
  });
});
