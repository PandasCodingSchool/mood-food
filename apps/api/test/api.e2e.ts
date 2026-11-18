import { readFileSync } from 'node:fs';
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

  it('CORS preflight allows every method the web app uses', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await fetch(BASE + '/user/me', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:8081', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'content-type,authorization' },
      });
      assert.ok(res.status < 300, `preflight ${method} → ${res.status}`);
      assert.match(res.headers.get('access-control-allow-methods') ?? '', new RegExp(method), method);
    }
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

  it('signs up and logs in with email, case-insensitively', async () => {
    const methods = await call('GET', '/auth/methods');
    assert.equal(methods.data.email, true);
    assert.equal(typeof methods.data.otp, 'boolean');

    const email = `Mail${rand()}@Example.com`;
    const up = await call('POST', '/auth/signup', { body: { name: 'Mail User', email, password: 'secret123' } });
    assert.equal(up.status, 201, JSON.stringify(up.data));
    assert.equal(up.data.user.email, email.toLowerCase());
    assert.equal(up.data.user.phone, null);

    const dup = await call('POST', '/auth/signup', { body: { name: 'X', email: email.toUpperCase(), password: 'secret123' } });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.error, 'Email already registered');

    const bad = await call('POST', '/auth/login', { body: { email, password: 'wrong-pass' } });
    assert.equal(bad.status, 401);
    assert.equal(bad.data.error, 'Invalid email or password');
    const ok = await call('POST', '/auth/login', { body: { email: ` ${email.toLowerCase()} `, password: 'secret123' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.id, up.data.user.id);

    assert.equal((await call('POST', '/auth/signup', { body: { name: 'X', password: 'secret123' } })).status, 400);
    assert.equal((await call('POST', '/auth/signup', { body: { name: 'X', email: 'nope', password: 'secret123' } })).status, 400);
  });

  it('email verification and password reset reject bad codes and never reveal accounts', async () => {
    const email = `verify${rand()}@example.com`;
    const up = await call('POST', '/auth/signup', { body: { name: 'V', email, password: 'secret123' } });
    const token = up.data.session.token;
    assert.equal((await call('GET', '/user/me', { token })).data.user.emailVerified, false);

    assert.equal((await call('POST', '/auth/email/send-verification', { token })).status, 200);
    assert.equal((await call('POST', '/auth/email/verify', { token, body: { otp: '000000' } })).status, 401);
    assert.equal((await call('POST', '/auth/email/verify', { token, body: { otp: 'abc' } })).status, 400);

    // Same answer whether or not the account exists.
    const known = await call('POST', '/auth/password/forgot', { body: { email } });
    const unknown = await call('POST', '/auth/password/forgot', { body: { email: `nobody${rand()}@example.com` } });
    assert.equal(known.status, 200);
    assert.deepEqual(known.data, unknown.data);

    const bad = await call('POST', '/auth/password/reset', { body: { email, otp: '000000', password: 'newsecret1' } });
    assert.equal(bad.status, 401);
    const none = await call('POST', '/auth/password/reset', { body: { email: `nobody${rand()}@example.com`, otp: '123456', password: 'newsecret1' } });
    assert.equal(none.status, 400);

    // A phone-only account has no address to verify.
    const phoneOnly = await signup();
    assert.equal((await call('POST', '/auth/email/send-verification', { token: phoneOnly.token })).status, 400);
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

describe('KitchenCircle', () => {
  it('creates a solo current-week household, edits a slot, locks it, and protects it from edits', async () => {
    const { token } = await signup('KitchenCircle User');
    const created = await call('POST', '/kitchen-circle/households', {
      token,
      body: { name: 'Flat 12', defaultServings: 3, startsOn: '2026-10-28', timezone: 'Asia/Kolkata' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.household.name, 'Flat 12');
    assert.equal(created.data.plan.weekStart, '2026-10-26');
    assert.equal(created.data.plan.weekEnd, '2026-11-01');
    assert.equal(created.data.plan.slots.length, 5);
    assert.ok(created.data.plan.slots.every((slot: { servings: number; state: string }) => slot.servings === 3 && slot.state === 'blank'));

    const householdId = created.data.household.id;
    const inviteeEmail = `kitchen${rand()}@example.com`;
    const inviteeSignup = await call('POST', '/auth/signup', { body: { name: 'KitchenCircle Cook', email: inviteeEmail, password: 'secret123' } });
    assert.equal(inviteeSignup.status, 201, JSON.stringify(inviteeSignup.data));
    const invite = await call('POST', `/kitchen-circle/households/${householdId}/invites`, { token, body: { email: inviteeEmail, role: 'cook' } });
    assert.equal(invite.status, 201, JSON.stringify(invite.data));
    assert.equal(invite.data.invite.email, inviteeEmail);
    const accepted = await call('POST', `/kitchen-circle/invites/${invite.data.invite.token}/accept`, { token: inviteeSignup.data.session.token });
    assert.equal(accepted.status, 201, JSON.stringify(accepted.data));
    assert.equal(accepted.data.role, 'cook');
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/plans/next`, { token: inviteeSignup.data.session.token, body: { referenceDate: '2026-10-28' } })).status, 403);

    const recipe = await call('POST', `/kitchen-circle/households/${householdId}/recipes`, { token, body: { title: 'Lemon Rice', defaultServings: 3, ingredients: [{ name: 'rice', quantity: 2, unit: 'cup' }], steps: ['Cook and temper rice.'] } });
    assert.equal(recipe.status, 201, JSON.stringify(recipe.data));

    const next = await call('POST', `/kitchen-circle/households/${householdId}/plans/next`, { token, body: { referenceDate: '2026-10-28' } });
    assert.equal(next.status, 201, JSON.stringify(next.data));
    assert.equal(next.data.plan.weekStart, '2026-11-02');
    assert.equal(next.data.plan.weekEnd, '2026-11-08');
    assert.equal(next.data.plan.slots.length, 7);
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/plans/next`, { token, body: { referenceDate: '2026-10-28' } })).data.plan.id, next.data.plan.id);

    const loaded = await call('GET', `/kitchen-circle/households/${householdId}/plans?weekStart=2026-10-26`, { token });
    assert.equal(loaded.status, 200);
    const slot = loaded.data.plan.slots[0];
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${slot.id}/recipe`, { token, body: { recipeVersionId: recipe.data.version.id } })).status, 200);
    const eligibility = await call('GET', `/kitchen-circle/slots/${slot.id}/grocery-eligibility`, { token });
    assert.equal(eligibility.status, 200);
    assert.equal(eligibility.data.eligible, true);
    const attendance = await call('PATCH', `/kitchen-circle/slots/${slot.id}/attendance`, { token: inviteeSignup.data.session.token, body: { status: 'absent' } });
    assert.equal(attendance.status, 200, JSON.stringify(attendance.data));
    assert.equal(attendance.data.attendance.status, 'absent');
    const edited = await call('PATCH', `/kitchen-circle/slots/${slot.id}`, {
      token,
      body: { state: 'planned', mealTitle: 'Dal Makhani', servings: 4, notes: 'Use pantry masalas' },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.slot.mealTitle, 'Dal Makhani');
    assert.equal(edited.data.slot.servings, 4);

    assert.equal((await call('POST', `/kitchen-circle/slots/${slot.id}/lock`, { token })).status, 201);
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${slot.id}`, { token, body: { mealTitle: 'Paneer Bhurji' } })).status, 409);
    assert.equal((await call('POST', `/kitchen-circle/slots/${slot.id}/unlock`, { token })).status, 201);
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${slot.id}`, { token, body: { mealTitle: 'Paneer Bhurji' } })).status, 200);

    const activities = await call('GET', `/kitchen-circle/households/${householdId}/activities`, { token });
    assert.equal(activities.status, 200);
    assert.deepEqual(activities.data.activities.map((a: { eventType: string }) => a.eventType).slice(0, 4), ['slot_updated', 'slot_unlocked', 'slot_locked', 'slot_updated']);
  });

  it('keeps recipes structured, private, reviewable, and version-stable', async () => {
    const owner = await signup('Recipe Owner');
    const outsider = await signup('Other Household');
    const mine = await call('POST', '/kitchen-circle/households', { token: owner.token, body: { name: 'Recipe Home', defaultServings: 2, startsOn: '2026-10-26' } });
    const theirs = await call('POST', '/kitchen-circle/households', { token: outsider.token, body: { name: 'Next Door', defaultServings: 2, startsOn: '2026-10-26' } });
    const householdId = mine.data.household.id;
    const otherHouseholdId = theirs.data.household.id;
    const slot = mine.data.plan.slots[0];
    const otherSlot = theirs.data.plan.slots[0];

    // Catalog is browsable and searchable by every household.
    const catalog = await call('GET', `/kitchen-circle/households/${householdId}/recipes?source=catalog`, { token: owner.token });
    assert.equal(catalog.status, 200, JSON.stringify(catalog.data));
    assert.ok(catalog.data.recipes.length >= 5);
    assert.ok(catalog.data.recipes.every((r: { source: string; currentVersion: { groceryReady: boolean } }) => r.source === 'catalog' && r.currentVersion.groceryReady));
    const dal = (await call('GET', `/kitchen-circle/households/${householdId}/recipes?q=dal`, { token: owner.token })).data.recipes;
    assert.ok(dal.some((r: { title: string }) => r.title === 'Dal Tadka'));

    // Incomplete or ambiguous ingredient data cannot become a usable recipe.
    const ambiguous = await call('POST', `/kitchen-circle/households/${householdId}/recipes`, { token: owner.token, body: { title: 'Mystery Curry', defaultServings: 2, ingredients: [{ name: 'masala', quantity: 1, unit: 'to taste' }], steps: ['Cook.'] } });
    assert.equal(ambiguous.status, 422);
    assert.ok(ambiguous.data.issues.length > 0);

    const created = await call('POST', `/kitchen-circle/households/${householdId}/recipes`, {
      token: owner.token,
      body: { title: 'Masala Khichdi', defaultServings: 2, ingredients: [{ name: 'Rice', quantity: 0.5, unit: 'cups' }, { name: 'moong dal', quantity: 100, unit: 'gms' }, { name: 'salt', quantity: 1, unit: 'to taste', optional: true }], steps: ['Pressure-cook rice and dal together.'], effort: 'easy', dietaryTags: ['vegetarian'] },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.deepEqual(created.data.version.ingredients.map((i: { canonicalName: string; unit: string }) => `${i.canonicalName}:${i.unit}`), ['rice:cup', 'moong dal:g', 'salt:to taste']);
    const recipeId = created.data.recipe.id;
    const v1 = created.data.version.id;

    // A household recipe is never visible to, or selectable by, another household.
    const outsiderList = (await call('GET', `/kitchen-circle/households/${otherHouseholdId}/recipes?q=khichdi`, { token: outsider.token })).data.recipes;
    assert.ok(outsiderList.every((r: { source: string }) => r.source === 'catalog'), JSON.stringify(outsiderList));
    assert.equal((await call('GET', `/kitchen-circle/households/${otherHouseholdId}/recipes/${recipeId}`, { token: outsider.token })).status, 404);
    assert.equal((await call('GET', `/kitchen-circle/households/${householdId}/recipes`, { token: outsider.token })).status, 403);
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${otherSlot.id}/recipe`, { token: outsider.token, body: { recipeVersionId: v1 } })).status, 404);

    // A selected slot keeps its original version after the recipe is edited.
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${slot.id}/recipe`, { token: owner.token, body: { recipeVersionId: v1 } })).status, 200);
    const v2 = await call('POST', `/kitchen-circle/households/${householdId}/recipes/${recipeId}/versions`, { token: owner.token, body: { defaultServings: 4, ingredients: [{ name: 'rice', quantity: 1, unit: 'cup' }, { name: 'moong dal', quantity: 200, unit: 'g' }], steps: ['Cook for 4.'] } });
    assert.equal(v2.status, 201, JSON.stringify(v2.data));
    assert.equal(v2.data.version.version, 2);
    const plan = await call('GET', `/kitchen-circle/households/${householdId}/plans?weekStart=2026-10-26`, { token: owner.token });
    const bound = plan.data.plan.slots.find((s: { id: string }) => s.id === slot.id);
    assert.equal(bound.recipeVersionId, v1);
    assert.deepEqual(bound.recipe, { recipeId, source: 'household', version: 1 });
    const detail = await call('GET', `/kitchen-circle/households/${householdId}/recipes/${recipeId}`, { token: owner.token });
    assert.deepEqual(detail.data.recipe.versions.map((v: { version: number }) => v.version), [2, 1]);
    assert.equal(detail.data.recipe.versions[1].defaultServings, 2);

    // Unreviewed AI drafts are labelled, unusable, and become household recipes only after approval.
    const draft = await call('POST', `/kitchen-circle/households/${householdId}/recipes`, { token: owner.token, body: { title: 'AI Pulao', draft: true, defaultServings: 2, ingredients: [{ name: 'rice', quantity: 1, unit: 'handful' }], steps: ['Cook.'] } });
    assert.equal(draft.status, 201, JSON.stringify(draft.data));
    assert.equal(draft.data.recipe.source, 'ai_draft');
    assert.equal(draft.data.version.groceryReady, false);
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${slot.id}/recipe`, { token: owner.token, body: { recipeVersionId: draft.data.version.id } })).status, 422);
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/recipe-versions/${draft.data.version.id}/approve`, { token: owner.token })).status, 422);
    const fixed = await call('POST', `/kitchen-circle/households/${householdId}/recipes/${draft.data.recipe.id}/versions`, { token: owner.token, body: { defaultServings: 2, ingredients: [{ name: 'rice', quantity: 1, unit: 'cup' }], steps: ['Cook.'] } });
    assert.equal(fixed.data.version.approvedAt, null);
    const approved = await call('POST', `/kitchen-circle/households/${householdId}/recipe-versions/${fixed.data.version.id}/approve`, { token: owner.token });
    assert.equal(approved.status, 201, JSON.stringify(approved.data));
    assert.equal(approved.data.version.groceryReady, true);
    const reviewed = (await call('GET', `/kitchen-circle/households/${householdId}/recipes/${draft.data.recipe.id}`, { token: owner.token })).data.recipe;
    assert.equal(reviewed.source, 'household');

    // Catalog recipes are directly usable but cannot be edited by a household.
    const dalTadka = dal.find((r: { title: string }) => r.title === 'Dal Tadka');
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/recipes/${dalTadka.id}/versions`, { token: owner.token, body: { defaultServings: 2, ingredients: [{ name: 'dal', quantity: 1, unit: 'cup' }], steps: ['x'] } })).status, 403);
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${slot.id}/recipe`, { token: owner.token, body: { recipeVersionId: dalTadka.currentVersion.id } })).status, 200);
    assert.equal((await call('GET', `/kitchen-circle/slots/${slot.id}/grocery-eligibility`, { token: owner.token })).data.eligible, true);

    // Typing a different meal by hand drops the recipe binding, so grocery planning cannot use a stale recipe.
    const retitled = await call('PATCH', `/kitchen-circle/slots/${slot.id}`, { token: owner.token, body: { mealTitle: 'Takeaway thali' } });
    assert.equal(retitled.data.slot.recipeVersionId, null);
    assert.equal((await call('GET', `/kitchen-circle/slots/${slot.id}/grocery-eligibility`, { token: owner.token })).data.eligible, false);
  });

  it('builds a deduplicated, source-traced weekly grocery list with pantry, coverage, and immutable snapshots', async () => {
    const owner = await signup('Grocery Owner');
    const outsider = await signup('Grocery Outsider');
    const token = owner.token;
    const created = await call('POST', '/kitchen-circle/households', { token, body: { name: 'Grocery Home', defaultServings: 2, startsOn: '2026-11-02' } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const householdId = created.data.household.id;
    const plan = created.data.plan;
    const [mon, tue, wed, thu] = plan.slots;
    const recipe = async (title: string, ingredients: unknown[]) => {
      const r = await call('POST', `/kitchen-circle/households/${householdId}/recipes`, { token, body: { title, defaultServings: 2, ingredients, steps: ['Cook.'] } });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      return r.data.version.id as string;
    };
    const curry = await recipe('Chicken Curry Test', [{ name: 'chicken', quantity: 500, unit: 'g' }, { name: 'onions', quantity: 2, unit: 'piece' }, { name: 'salt', quantity: 1, unit: 'tsp' }]);
    const pulao = await recipe('Chicken Pulao Test', [{ name: 'chicken', quantity: 0.75, unit: 'kg' }, { name: 'onion', quantity: 1, unit: 'pcs' }, { name: 'spring onion', quantity: 1, unit: 'bunch' }]);
    const tikka = await recipe('Chicken Tikka Test', [{ name: 'Chicken', quantity: 400, unit: 'gms' }]);
    for (const [slot, versionId] of [[mon, curry], [tue, pulao], [wed, tikka]] as const) {
      assert.equal((await call('PATCH', `/kitchen-circle/slots/${slot.id}/recipe`, { token, body: { recipeVersionId: versionId } })).status, 200);
    }
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${thu.id}`, { token, body: { state: 'leftovers' } })).status, 200);

    // Aggregation, unit conversion, dedupe, distinctions, pantry, and source trace.
    const first = await call('POST', `/kitchen-circle/households/${householdId}/grocery-lists`, { token, body: { planId: plan.id, scope: 'week', referenceDate: '2026-11-02' } });
    assert.equal(first.status, 201, JSON.stringify(first.data));
    const listId = first.data.snapshot.id;
    const line = (lines: Array<{ canonicalName: string }>, name: string) => lines.find((l) => l.canonicalName === name) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const chicken = line(first.data.lines, 'chicken');
    assert.deepEqual([chicken.quantity, chicken.unit, chicken.kind, chicken.status], [1.65, 'kg', 'recipe', 'buy']);
    assert.deepEqual(chicken.sources.map((s: { plannedFor: string; recipeTitle: string }) => `${s.plannedFor}:${s.recipeTitle}`), ['2026-11-02:Chicken Curry Test', '2026-11-03:Chicken Pulao Test', '2026-11-04:Chicken Tikka Test']);
    assert.equal(chicken.sources.reduce((sum: number, s: { baseQuantity: number }) => sum + s.baseQuantity, 0), chicken.baseQuantity);
    assert.deepEqual([line(first.data.lines, 'onion').quantity, line(first.data.lines, 'onion').unit], [3, 'piece']);
    assert.ok(line(first.data.lines, 'spring onion'));
    assert.deepEqual([line(first.data.lines, 'salt').kind, line(first.data.lines, 'salt').status], ['pantry', 'already_have']);
    assert.deepEqual(first.data.coverage.map((c: { plannedFor: string }) => c.plannedFor), ['2026-11-02', '2026-11-03', '2026-11-04']);
    assert.ok(first.data.excluded.some((e: { plannedFor: string; reason: string }) => e.plannedFor === '2026-11-05' && e.reason === 'No cooking planned.'));

    // No duplicate day coverage without an explicit override.
    const again = await call('POST', `/kitchen-circle/households/${householdId}/grocery-lists`, { token, body: { planId: plan.id, scope: 'week', referenceDate: '2026-11-02' } });
    assert.equal(again.status, 409);
    assert.equal(again.data.conflicts.length, 3);
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/grocery-lists`, { token, body: { planId: plan.id, scope: 'day', date: '2026-11-02', referenceDate: '2026-11-02' } })).status, 409);
    const pantry = await call('PUT', `/kitchen-circle/households/${householdId}/pantry`, { token, body: { name: 'Salt', inPantry: false } });
    assert.equal(pantry.status, 200, JSON.stringify(pantry.data));
    assert.ok(!pantry.data.pantry.items.includes('salt'));
    const extraDay = await call('POST', `/kitchen-circle/households/${householdId}/grocery-lists`, { token, body: { planId: plan.id, scope: 'day', date: '2026-11-02', referenceDate: '2026-11-02', override: true } });
    assert.equal(extraDay.status, 201, JSON.stringify(extraDay.data));
    assert.equal(line(extraDay.data.lines, 'salt').kind, 'recipe');
    assert.equal(extraDay.data.coverage[0].override, true);

    // A plan edit never rewrites an existing list; it is surfaced as a plan change instead.
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${mon.id}`, { token, body: { servings: 6 } })).status, 200);
    const afterEdit = await call('GET', `/kitchen-circle/grocery-lists/${listId}`, { token });
    assert.equal(line(afterEdit.data.lines, 'chicken').quantity, 1.65);
    assert.deepEqual(afterEdit.data.planChanges.map((c: { plannedFor: string }) => c.plannedFor), ['2026-11-02']);

    // Manual controls: skip warns for required items, quantity edits keep the original, manual adds are labelled.
    const skipped = await call('PATCH', `/kitchen-circle/grocery-lists/${listId}/lines/${chicken.id}`, { token, body: { status: 'skipped' } });
    assert.equal(skipped.status, 200, JSON.stringify(skipped.data));
    assert.match(skipped.data.warning, /required for Chicken Curry Test \(2026-11-02\)/);
    const onionId = line(first.data.lines, 'onion').id;
    const changed = await call('PATCH', `/kitchen-circle/grocery-lists/${listId}/lines/${onionId}`, { token, body: { quantity: 4, estimatedPricePaise: 6_000 } });
    assert.deepEqual([changed.data.line.quantity, changed.data.line.originalQuantity, changed.data.line.manuallyChanged], [4, 3, true]);
    const manual = await call('POST', `/kitchen-circle/grocery-lists/${listId}/lines`, { token, body: { name: 'Bread', quantity: 1, unit: 'piece' } });
    assert.equal(manual.status, 201, JSON.stringify(manual.data));
    assert.equal(manual.data.line.kind, 'manual');
    const budgeted = await call('PATCH', `/kitchen-circle/grocery-lists/${listId}`, { token, body: { budgetPaise: 5_000 } });
    assert.deepEqual([budgeted.data.totals.skippedRequired, budgeted.data.totals.estimatedTotalPaise, budgeted.data.totals.overBudget], [1, 6_000, true]);
    assert.equal((await call('GET', `/kitchen-circle/grocery-lists/${listId}`, { token: outsider.token })).status, 403);

    // Discarding a draft releases its days; a new list reflects the edited plan; finalized lists are frozen.
    assert.equal((await call('POST', `/kitchen-circle/grocery-lists/${listId}/discard`, { token })).status, 201);
    const fresh = await call('POST', `/kitchen-circle/households/${householdId}/grocery-lists`, { token, body: { planId: plan.id, scope: 'week', referenceDate: '2026-11-02' } });
    assert.equal(fresh.status, 201, JSON.stringify(fresh.data));
    assert.equal(line(fresh.data.lines, 'chicken').quantity, 2.65);
    const finalized = await call('POST', `/kitchen-circle/grocery-lists/${fresh.data.snapshot.id}/finalize`, { token });
    assert.equal(finalized.data.snapshot.status, 'finalized');
    assert.equal((await call('PATCH', `/kitchen-circle/grocery-lists/${fresh.data.snapshot.id}/lines/${line(fresh.data.lines, 'chicken').id}`, { token, body: { status: 'skipped' } })).status, 409);
    assert.equal((await call('POST', `/kitchen-circle/grocery-lists/${fresh.data.snapshot.id}/discard`, { token })).status, 409);
    const lists = await call('GET', `/kitchen-circle/households/${householdId}/grocery-lists?planId=${plan.id}`, { token });
    assert.deepEqual(lists.data.lists.map((l: { status: string }) => l.status).sort(), ['discarded', 'draft', 'finalized']);
  });
});

describe('KitchenCircle auto-fill', () => {
  // Needs the intelligence service (the planner lives there). Skipped when it is offline unless E2E_REQUIRE_INTELLIGENCE=1.
  it('proposes only open days, honours diets, swaps and regenerates, and applies only what is accepted', async (t) => {
    const owner = await signup('Autofill Owner');
    const outsider = await signup('Autofill Outsider');
    const token = owner.token;
    const created = await call('POST', '/kitchen-circle/households', { token, body: { name: 'Autofill Home', defaultServings: 2, startsOn: '2026-11-09' } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const householdId = created.data.household.id;
    const plan = created.data.plan;
    const slots = plan.slots as Array<{ id: string; plannedFor: string }>;
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/preferences`, { token, body: { strength: 'cannot_eat', category: 'diet', value: 'vegetarian' } })).status, 201);
    const khichdi = await call('POST', `/kitchen-circle/households/${householdId}/recipes`, { token, body: { title: 'Masala Khichdi', defaultServings: 2, ingredients: [{ name: 'rice', quantity: 0.5, unit: 'cup' }, { name: 'moong dal', quantity: 0.5, unit: 'cup' }], steps: ['Pressure-cook.'], effort: 'easy', dietaryTags: ['vegetarian'] } });
    assert.equal(khichdi.status, 201, JSON.stringify(khichdi.data));
    const dal = (await call('GET', `/kitchen-circle/households/${householdId}/recipes?q=Dal%20Tadka`, { token })).data.recipes[0];
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${slots[0].id}/recipe`, { token, body: { recipeVersionId: dal.currentVersion.id } })).status, 200);
    assert.equal((await call('POST', `/kitchen-circle/slots/${slots[0].id}/lock`, { token })).status, 201);
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${slots[2].id}`, { token, body: { state: 'leftovers' } })).status, 200);

    const first = await call('POST', `/kitchen-circle/plans/${plan.id}/autofill`, { token, body: {} });
    if (first.status === 503 && process.env.E2E_REQUIRE_INTELLIGENCE !== '1') { t.skip('intelligence service offline'); return; }
    assert.equal(first.status, 201, JSON.stringify(first.data));
    const proposal = first.data.proposal;
    const proposedDays = proposal.items.map((i: { plannedFor: string }) => i.plannedFor);
    assert.deepEqual(proposedDays, ['2026-11-10', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    const titles = proposal.items.map((i: { title: string }) => i.title);
    assert.ok(titles.every((title: string) => !['Chicken Curry', 'Egg Curry', 'Dal Tadka'].includes(title)), titles.join(','));
    assert.equal(new Set(titles).size, titles.length);
    assert.ok(proposal.items.every((i: { reasons: string[] }) => i.reasons.length > 0));

    // Proposing never changes the plan.
    const untouched = await call('GET', `/kitchen-circle/households/${householdId}/plans?weekStart=2026-11-09`, { token });
    assert.ok(untouched.data.plan.slots.filter((s: { state: string }) => s.state === 'blank').length === 5);
    assert.equal((await call('POST', `/kitchen-circle/plans/${plan.id}/autofill`, { token: outsider.token, body: {} })).status, 403);

    // Swap one proposed day: a different recipe, and the old one is remembered.
    const target = proposal.items[0];
    const swapped = await call('POST', `/kitchen-circle/slots/${target.slotId}/swap`, { token, body: { proposalId: proposal.id } });
    assert.equal(swapped.status, 201, JSON.stringify(swapped.data));
    assert.notEqual(swapped.data.item.recipeId, target.recipeId);
    assert.ok(swapped.data.item.excludedRecipeIds.includes(target.recipeId));

    // Regenerate supersedes the old proposal.
    const regenerated = await call('POST', `/kitchen-circle/plans/${plan.id}/autofill`, { token, body: { regenerate: true } });
    assert.equal(regenerated.status, 201, JSON.stringify(regenerated.data));
    assert.equal((await call('POST', `/kitchen-circle/plans/${plan.id}/proposals/${proposal.id}/apply`, { token, body: {} })).status, 409);
    const fresh = regenerated.data.proposal;
    assert.equal((await call('GET', `/kitchen-circle/plans/${plan.id}/proposals/latest`, { token })).data.proposal.id, fresh.id);

    // A day edited after the proposal is never overwritten; servings edits apply.
    const edited = fresh.items.find((i: { plannedFor: string }) => i.plannedFor === '2026-11-12');
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${edited.slotId}`, { token, body: { state: 'planned', mealTitle: 'Pizza night' } })).status, 200);
    const tuesday = fresh.items.find((i: { plannedFor: string }) => i.plannedFor === '2026-11-10');
    const applied = await call('POST', `/kitchen-circle/plans/${plan.id}/proposals/${fresh.id}/apply`, { token, body: { servings: { [tuesday.id]: 5 } } });
    assert.equal(applied.status, 201, JSON.stringify(applied.data));
    assert.equal(applied.data.applied.length, 4);
    assert.deepEqual(applied.data.stale.map((s: { plannedFor: string }) => s.plannedFor), ['2026-11-12']);
    assert.equal(applied.data.proposal.status, 'applied');
    const after = (await call('GET', `/kitchen-circle/households/${householdId}/plans?weekStart=2026-11-09`, { token })).data.plan.slots;
    const day = (date: string) => after.find((s: { plannedFor: string }) => s.plannedFor === date);
    assert.deepEqual([day('2026-11-10').state, day('2026-11-10').mealTitle, day('2026-11-10').servings], ['planned', tuesday.title, 5]);
    assert.equal(day('2026-11-12').mealTitle, 'Pizza night');
    assert.equal(day('2026-11-09').state, 'locked');

    // Read-only alternatives for a planned day exclude its current recipe.
    const options = await call('POST', `/kitchen-circle/slots/${day('2026-11-10').id}/swap`, { token, body: {} });
    assert.equal(options.status, 201, JSON.stringify(options.data));
    assert.ok(options.data.options.length > 0 && options.data.options.every((o: { title: string }) => o.title !== tuesday.title));

    // No open days → nothing to propose; clearing a day and discarding leaves the plan as it was.
    assert.equal((await call('POST', `/kitchen-circle/plans/${plan.id}/autofill`, { token, body: {} })).status, 422);
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${day('2026-11-15').id}`, { token, body: { state: 'blank', mealTitle: null } })).status, 200);
    const again = await call('POST', `/kitchen-circle/plans/${plan.id}/autofill`, { token, body: {} });
    assert.equal(again.data.proposal.items.length, 1);
    assert.equal((await call('POST', `/kitchen-circle/plans/${plan.id}/proposals/${again.data.proposal.id}/discard`, { token })).status, 201);
    assert.equal((await call('GET', `/kitchen-circle/plans/${plan.id}/proposals/latest`, { token })).data.proposal, null);
  });
});

describe('KitchenCircle shared chat', () => {
  it('turns messages into audited action cards that respect clarification, confirmation, and permissions', async (t) => {
    const owner = await signup('Chat Owner');
    const token = owner.token;
    const created = await call('POST', '/kitchen-circle/households', { token, body: { name: 'Chat Home', defaultServings: 2, startsOn: '2026-11-09' } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const householdId = created.data.household.id;
    const planId = created.data.plan.id;
    const join = async (role: 'member' | 'cook') => {
      const email = `chat-${role}-${rand()}@example.com`;
      const account = await call('POST', '/auth/signup', { body: { name: `Chat ${role}`, email, password: 'secret123' } });
      const invite = await call('POST', `/kitchen-circle/households/${householdId}/invites`, { token, body: { email, role } });
      assert.equal((await call('POST', `/kitchen-circle/invites/${invite.data.invite.token}/accept`, { token: account.data.session.token })).status, 201);
      return account.data.session.token as string;
    };
    const member = await join('member');
    const cook = await join('cook');
    const say = (body: string, as = token) => call('POST', `/kitchen-circle/households/${householdId}/chat`, { token: as, body: { planId, body } });
    const slots = async () => (await call('GET', `/kitchen-circle/households/${householdId}/plans?weekStart=2026-11-09`, { token })).data.plan.slots as Array<{ id: string; plannedFor: string; state: string; mealTitle: string | null; servings: number }>;
    const day = async (date: string) => (await slots()).find((s) => s.plannedFor === date)!;

    // Clear low-risk edit → applied and logged.
    const leftovers = await say('Leftovers on Tuesday');
    if (leftovers.status === 201 && leftovers.data.source === 'none' && process.env.E2E_REQUIRE_INTELLIGENCE !== '1') { t.skip('intelligence service offline'); return; }
    assert.equal(leftovers.status, 201, JSON.stringify(leftovers.data));
    assert.deepEqual(leftovers.data.actions.map((a: { actionType: string; status: string }) => `${a.actionType}:${a.status}`), ['SET_DAY_STATUS:applied']);
    assert.equal((await day('2026-11-10')).state, 'leftovers');
    assert.match(leftovers.data.assistant.body, /^Done: Leftovers on Tuesday/);

    // Ambiguous shared instruction in a multi-member household → clarification only the sender can answer.
    const out = await say('We are going out Friday');
    const question = out.data.actions[0];
    assert.equal(question.status, 'needs_clarification');
    assert.deepEqual(question.clarification.options.map((o: { label: string }) => o.label), ['Everyone is out', 'Only me']);
    assert.equal((await day('2026-11-13')).state, 'blank');
    assert.equal((await call('POST', `/kitchen-circle/chat/actions/${question.id}/clarify`, { token: member, body: { optionIndex: 0 } })).status, 403);
    const answered = await call('POST', `/kitchen-circle/chat/actions/${question.id}/clarify`, { token, body: { optionIndex: 0 } });
    assert.equal(answered.status, 201, JSON.stringify(answered.data));
    assert.equal((await day('2026-11-13')).state, 'household_out');

    // Meal with a catalog recipe and servings — sent with a client id, so its live steps can be followed.
    const meal = await call('POST', `/kitchen-circle/households/${householdId}/chat`, { token, body: { planId, body: 'make dal tadka on wednesday for 4 people', clientId: 'e2e-progress-1' } });
    const progress = await call('GET', `/kitchen-circle/households/${householdId}/chat/progress/e2e-progress-1`, { token });
    assert.equal(progress.status, 200, JSON.stringify(progress.data));
    assert.equal(progress.data.done, true);
    assert.ok(progress.data.events.some((e: { text: string }) => /allergies/.test(e.text)), JSON.stringify(progress.data.events));
    assert.equal((await call('GET', `/kitchen-circle/households/${householdId}/chat/progress/e2e-progress-1`, { token: cook })).status, 403);
    assert.equal(meal.data.actions[0].status, 'applied', JSON.stringify(meal.data));
    assert.deepEqual([(await day('2026-11-11')).mealTitle, (await day('2026-11-11')).servings], ['Dal Tadka', 4]);

    // Locked-day change → confirmation; any member may confirm and the day stays locked.
    const wednesday = await day('2026-11-11');
    assert.equal((await call('POST', `/kitchen-circle/slots/${wednesday.id}/lock`, { token })).status, 201);
    const locked = await say('make poha on wednesday');
    const pending = locked.data.actions[0];
    assert.deepEqual([pending.status, pending.policy], ['needs_confirmation', 'locked_day']);
    assert.equal((await day('2026-11-11')).mealTitle, 'Dal Tadka');
    const confirmed = await call('POST', `/kitchen-circle/chat/actions/${pending.id}/confirm`, { token: member });
    assert.equal(confirmed.data.action.status, 'confirmed', JSON.stringify(confirmed.data));
    assert.deepEqual([(await day('2026-11-11')).mealTitle, (await day('2026-11-11')).state], ['Poha', 'locked']);
    assert.equal((await call('POST', `/kitchen-circle/chat/actions/${pending.id}/confirm`, { token })).status, 409);

    // A pending card expires if the day changes before it is confirmed.
    const unlock = (await say('unlock wednesday')).data.actions[0];
    assert.equal(unlock.status, 'needs_confirmation');
    assert.equal((await call('POST', `/kitchen-circle/slots/${wednesday.id}/unlock`, { token })).status, 201);
    assert.equal((await call('POST', `/kitchen-circle/chat/actions/${unlock.id}/confirm`, { token })).data.action.status, 'expired');

    // Bulk week change → every day waits for review.
    const bulk = await say('no cooking all week');
    assert.ok(bulk.data.actions.length >= 3);
    assert.ok(bulk.data.actions.every((a: { status: string; policy: string }) => a.status === 'needs_confirmation' && a.policy === 'bulk_change'));
    assert.equal((await day('2026-11-14')).state, 'blank');
    assert.equal((await call('POST', `/kitchen-circle/chat/actions/${bulk.data.actions[0].id}/reject`, { token })).data.action.status, 'rejected');

    // Recurring rule and grocery list need confirmation; auto-fill only creates a proposal.
    const rule = (await say('every Monday vegetarian')).data.actions[0];
    assert.deepEqual([rule.status, rule.policy], ['needs_confirmation', 'recurring_rule']);
    assert.equal((await call('POST', `/kitchen-circle/chat/actions/${rule.id}/confirm`, { token })).data.action.status, 'confirmed');
    const rules = (await call('GET', `/kitchen-circle/households/${householdId}/rules`, { token })).data.rules;
    assert.ok(rules.some((r: { weekday: number; constraint: { diet?: string } }) => r.weekday === 0 && r.constraint.diet === 'vegetarian'));
    const grocery = (await say('make a grocery list')).data.actions[0];
    assert.deepEqual([grocery.status, grocery.policy], ['needs_confirmation', 'order_action']);
    // Asking again while that card is still waiting doesn't create a second one.
    assert.equal((await say('make a grocery list')).data.actions.length, 0);
    assert.equal((await call('GET', `/kitchen-circle/households/${householdId}/grocery-lists?planId=${planId}`, { token })).data.lists.length, 0);
    const fill = (await say('fill the rest of the week')).data.actions[0];
    assert.equal(fill.status, 'applied', JSON.stringify(fill));
    assert.ok(fill.result.proposalId);
    assert.equal((await day('2026-11-14')).state, 'blank');

    // Voice notes: validated, members only; without a model key it says so plainly instead of guessing.
    const clip = Buffer.from('\u0000\u0000\u0000\u0018ftypM4A ' + 'x'.repeat(64)).toString('base64');
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/chat/voice`, { token, body: { planId, audio: clip, mimeType: 'image/png' } })).status, 400);
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/chat/voice`, { token: cook, body: { planId, audio: clip, mimeType: 'audio/m4a' } })).status, 403);
    const voice = await call('POST', `/kitchen-circle/households/${householdId}/chat/voice`, { token, body: { planId, audio: clip, mimeType: 'audio/m4a', clientId: 'e2e-voice-1' } });
    assert.ok([503, 422].includes(voice.status), JSON.stringify(voice.data));
    const heard = await call('GET', `/kitchen-circle/households/${householdId}/chat/progress/e2e-voice-1`, { token });
    assert.equal(heard.data.done, true);
    assert.equal(heard.data.events[0].text, 'Listening to your message');

    // Cooks never see or use the chat; members see the full audited history.
    assert.equal((await call('GET', `/kitchen-circle/households/${householdId}/chat?planId=${planId}`, { token: cook })).status, 403);
    assert.equal((await say('lock friday', cook)).status, 403);
    const history = await call('GET', `/kitchen-circle/households/${householdId}/chat?planId=${planId}`, { token: member });
    assert.equal(history.status, 200);
    assert.ok(history.data.messages.some((m: { role: string; authorName: string }) => m.role === 'member' && m.authorName === 'Chat Owner'));
    assert.ok(history.data.messages.some((m: { body: string }) => /^Confirmed: Poha on Wednesday \(instead of Dal Tadka\) — Chat member/.test(m.body)));
    assert.ok(history.data.messages.flatMap((m: { actions: unknown[] }) => m.actions).length >= 10);
  });
});

describe('KitchenCircle AI recipes and dish impact', () => {
  const catalogV2 = JSON.parse(readFileSync(new URL('../src/kitchen-circle/catalog/catalog-recipes.json', import.meta.url), 'utf8')) as { recipes: Array<{ title: string; version_id: string }> };
  const versionOf = (title: string) => catalogV2.recipes.find((r) => r.title === title)!.version_id;

  it('ships the expanded catalog, previews the impact of a swap, and offers AI for unknown dishes', async (t) => {
    const { token } = await signup('AI Recipe Owner');
    const created = await call('POST', '/kitchen-circle/households', { token, body: { name: 'AI Home', defaultServings: 4, startsOn: '2026-11-16' } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const householdId = created.data.household.id;
    const planId = created.data.plan.id;
    const slots = created.data.plan.slots as Array<{ id: string; plannedFor: string }>;

    // Catalog v2 is seeded and searchable.
    const browse = await call('GET', `/kitchen-circle/households/${householdId}/recipes?source=catalog`, { token });
    assert.ok(browse.data.recipes.length >= 70, `catalog has ${browse.data.recipes.length}`);
    assert.ok((await call('GET', `/kitchen-circle/households/${householdId}/recipes?q=rajma`, { token })).data.recipes.some((r: { title: string }) => r.title === 'Rajma Chawal'));

    // Swapping Dal Tadka for Rajma Chawal: what's added, what's reused, what's no longer needed.
    const monday = slots[0];
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${monday.id}/recipe`, { token, body: { recipeVersionId: 'c1a00000-0000-4000-8000-000000000101' } })).status, 200);
    const swap = await call('POST', `/kitchen-circle/slots/${monday.id}/impact`, { token, body: { recipeVersionId: versionOf('Rajma Chawal') } });
    if (swap.status === 201 && process.env.E2E_REQUIRE_INTELLIGENCE !== '1' && swap.data.impact.warnings.some((w: string) => /Couldn’t check/.test(w))) { t.skip('intelligence service offline'); return; }
    assert.equal(swap.status, 201, JSON.stringify(swap.data));
    const impact = swap.data.impact;
    assert.equal(impact.safe, true);
    assert.equal(impact.replaces, 'Dal Tadka');
    assert.ok(impact.adds.some((l: { name: string }) => /rajma/i.test(l.name)), JSON.stringify(impact.adds));
    assert.ok(impact.noLongerNeeded.some((l: { name: string }) => /toor dal/i.test(l.name)), JSON.stringify(impact.noLongerNeeded));
    assert.ok(impact.summary.length > 0);

    // A household peanut allergy makes Lemon Rice unsafe — phrased without naming anyone.
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/preferences`, { token, body: { strength: 'cannot_eat', category: 'allergy', value: 'peanut' } })).status, 201);
    const unsafe = (await call('POST', `/kitchen-circle/slots/${slots[1].id}/impact`, { token, body: { recipeVersionId: versionOf('Lemon Rice') } })).data.impact;
    assert.equal(unsafe.safe, false, JSON.stringify(unsafe));
    assert.match(unsafe.warnings[0], /Not safe for everyone/);
    assert.doesNotMatch(unsafe.warnings.join(' '), /AI Recipe Owner|peanut/i);

    // Without a model key the AI writer degrades to a clear 503, never a half-made recipe.
    const gen = await call('POST', `/kitchen-circle/households/${householdId}/recipes/generate`, { token, body: { dish: 'Thalipeeth' } });
    assert.equal(gen.status, 503, JSON.stringify(gen.data));
    assert.equal((await call('GET', `/kitchen-circle/households/${householdId}/recipes?source=ai_draft`, { token })).data.recipes.length, 0);

    // An unknown dish in chat → one question with answers (AI recipe, close matches, or a plain note); the card doesn't repeat it.
    const asked = await call('POST', `/kitchen-circle/households/${householdId}/chat`, { token, body: { planId, body: 'make thalipeeth on wednesday' } });
    assert.equal(asked.status, 201, JSON.stringify(asked.data));
    const card = asked.data.actions[0];
    assert.equal(card.status, 'needs_clarification');
    const labels = card.clarification.options.map((o: { label: string }) => o.label);
    assert.match(labels[0], /^Write a recipe for Thalipeeth \(AI\)$/i);
    assert.ok(labels.some((l: string) => /^Just write/.test(l)), labels.join(' | '));
    assert.equal(asked.data.assistant.body, card.clarification.question);

    // Picking "AI" without a model key fails gracefully on the card; picking the plain note plans the title.
    const ai = await call('POST', `/kitchen-circle/chat/actions/${card.id}/clarify`, { token, body: { optionIndex: 0 } });
    assert.ok(ai.status < 500, JSON.stringify(ai.data));
    const history = (await call('GET', `/kitchen-circle/households/${householdId}/chat?planId=${planId}`, { token })).data.messages;
    const recipeCard = history.flatMap((m: { actions: Array<{ actionType: string; status: string }> }) => m.actions).find((a: { actionType: string }) => a.actionType === 'CREATE_RECIPE');
    assert.equal(recipeCard?.status, 'failed', JSON.stringify(recipeCard));

    // The reported bug: "chicken tacos" must never become Chicken 65 just because both mention chicken.
    const tacos = await call('POST', `/kitchen-circle/households/${householdId}/chat`, { token, body: { planId, body: 'Can we do chicken tacos on thursday?' } });
    assert.equal(tacos.data.actions[0].status, 'needs_clarification', JSON.stringify(tacos.data));
    assert.match(tacos.data.actions[0].clarification.options[0].label, /^Write a recipe for Chicken Tacos \(AI\)$/);
    assert.equal((await call('GET', `/kitchen-circle/households/${householdId}/plans?weekStart=2026-11-16`, { token })).data.plan.slots[3].mealTitle, null);
  });
});

describe('KitchenCircle cart', () => {
  it('builds a pack-optimized sample cart members can review while live writes stay owner-only and flag-gated', async (t) => {
    const owner = await signup('Cart Owner');
    const token = owner.token;
    const created = await call('POST', '/kitchen-circle/households', { token, body: { name: 'Cart Home', defaultServings: 2, startsOn: '2026-11-16' } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const householdId = created.data.household.id;
    const plan = created.data.plan;
    const join = async (role: 'member' | 'cook') => {
      const email = `cart-${role}-${rand()}@example.com`;
      const account = await call('POST', '/auth/signup', { body: { name: `Cart ${role}`, email, password: 'secret123' } });
      const invite = await call('POST', `/kitchen-circle/households/${householdId}/invites`, { token, body: { email, role } });
      assert.equal((await call('POST', `/kitchen-circle/invites/${invite.data.invite.token}/accept`, { token: account.data.session.token })).status, 201);
      return account.data.session.token as string;
    };
    const member = await join('member');
    const cook = await join('cook');
    const recipe = await call('POST', `/kitchen-circle/households/${householdId}/recipes`, { token, body: { title: 'Cart Chicken', defaultServings: 2, ingredients: [{ name: 'chicken', quantity: 0.55, unit: 'kg' }, { name: 'onion', quantity: 1, unit: 'piece' }], steps: ['Cook.'] } });
    for (const slot of plan.slots.slice(0, 3)) {
      assert.equal((await call('PATCH', `/kitchen-circle/slots/${slot.id}/recipe`, { token, body: { recipeVersionId: recipe.data.version.id } })).status, 200);
    }
    const list = await call('POST', `/kitchen-circle/households/${householdId}/grocery-lists`, { token, body: { planId: plan.id, scope: 'week', referenceDate: '2026-11-16' } });
    assert.equal(list.status, 201, JSON.stringify(list.data));
    const listId = list.data.snapshot.id;

    // Members can build a read-only preview; with flags off it uses the labelled sample catalogue.
    const preview = await call('POST', `/kitchen-circle/grocery-lists/${listId}/cart`, { token: member, body: {} });
    if (preview.status === 503 && process.env.E2E_REQUIRE_INTELLIGENCE !== '1') { t.skip('intelligence service offline'); return; }
    assert.equal(preview.status, 201, JSON.stringify(preview.data));
    const cart = preview.data.cart;
    assert.deepEqual([cart.provider, cart.status, cart.addressId], ['fixture', 'preview', null]);
    const chicken = cart.lines.find((l: { name: string }) => l.name === 'chicken');
    assert.deepEqual(chicken.product.packs.map((p: { label: string; count: number }) => `${p.count} x ${p.label}`), ['6 x 300 g']);
    assert.deepEqual([chicken.required, chicken.product.purchased, chicken.product.surplus], ['1.65 kg', '1.8 kg', '150 g']);
    assert.match(chicken.explanation, /Need 1\.65 kg; 6 × 300 g = 1\.8 kg \(150 g extra\)/);
    assert.ok(cart.items.some((i: { quantity: number }) => i.quantity === 6));
    assert.ok(cart.warnings.some((w: string) => w.startsWith('Sample catalogue')));
    assert.equal(cart.totals.over_cap, true);
    assert.deepEqual([preview.data.capabilities.liveGrocery, preview.data.capabilities.liveWrites, preview.data.capabilities.role], [false, false, 'member']);

    // Cooks never see carts or prices.
    assert.equal((await call('GET', `/kitchen-circle/grocery-lists/${listId}/cart`, { token: cook })).status, 403);
    assert.equal((await call('POST', `/kitchen-circle/grocery-lists/${listId}/cart`, { token: cook, body: {} })).status, 403);

    // Only the owner may touch the live cart, and only when the rollout flags allow it.
    assert.equal((await call('POST', `/kitchen-circle/carts/${cart.id}/write`, { token: member })).status, 403);
    assert.equal((await call('POST', `/kitchen-circle/carts/${cart.id}/write`, { token })).status, 409);
    assert.equal((await call('POST', `/kitchen-circle/carts/${cart.id}/checkout`, { token, body: { confirm: true, expectedTotal: 1000 } })).status, 409);
    assert.equal((await call('POST', `/kitchen-circle/carts/${cart.id}/checkout`, { token, body: { confirm: false, expectedTotal: 1000 } })).status, 400);
    assert.equal((await call('GET', `/kitchen-circle/households/${householdId}/delivery-addresses`, { token })).status, 409);
    assert.equal((await call('PUT', `/kitchen-circle/households/${householdId}/delivery-address`, { token: member, body: { addressId: 'a1', label: 'Home' } })).status, 403);
    assert.equal((await call('PUT', `/kitchen-circle/households/${householdId}/delivery-address`, { token, body: { addressId: 'a1', label: 'Home' } })).status, 200);
    // Still sample: live matching is off even with an address set.
    const again = await call('POST', `/kitchen-circle/grocery-lists/${listId}/cart`, { token, body: { scope: 'all' } });
    assert.equal(again.data.cart.provider, 'fixture');
    assert.deepEqual(again.data.capabilities.address, { id: 'a1', label: 'Home' });
    const latest = await call('GET', `/kitchen-circle/grocery-lists/${listId}/cart`, { token: member });
    assert.equal(latest.data.cart.id, again.data.cart.id);
    const activities = (await call('GET', `/kitchen-circle/households/${householdId}/activities`, { token })).data.activities.map((a: { eventType: string }) => a.eventType);
    assert.ok(activities.includes('cart_previewed') && activities.includes('delivery_address_set'));
    assert.ok(!activities.includes('cart_written') && !activities.includes('order_placed'));
  });
});

describe('KitchenCircle cook, notifications, feedback & metrics', () => {
  it('shares a sanitised cook view, notifies members by their settings, records feedback, and reports metrics', async () => {
    const indiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const today = indiaToday();
    const owner = await signup('Cook Owner');
    const token = owner.token;
    const created = await call('POST', '/kitchen-circle/households', { token, body: { name: 'Cook Home', defaultServings: 4, startsOn: today } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const householdId = created.data.household.id;
    const plan = created.data.plan;
    const todaySlot = plan.slots[0];
    const join = async (role: 'member' | 'cook') => {
      const email = `cookflow-${role}-${rand()}@example.com`;
      const account = await call('POST', '/auth/signup', { body: { name: `Cook ${role}`, email, password: 'secret123' } });
      const invite = await call('POST', `/kitchen-circle/households/${householdId}/invites`, { token, body: { email, role } });
      assert.equal((await call('POST', `/kitchen-circle/invites/${invite.data.invite.token}/accept`, { token: account.data.session.token })).status, 201);
      return account.data.session.token as string;
    };
    await call('POST', '/kitchen-circle/lab/notify-tick', { body: {} }); // start the notifier cursor from here
    const member = await join('member');
    const cook = await join('cook');
    const recipe = await call('POST', `/kitchen-circle/households/${householdId}/recipes`, { token, body: { title: 'Rajma Chawal', defaultServings: 2, ingredients: [{ name: 'rajma', quantity: 150, unit: 'g' }, { name: 'rice', quantity: 1, unit: 'cup' }, { name: 'salt', quantity: 1, unit: 'to taste', optional: true }], steps: ['Soak rajma for 8 hours.', 'Pressure-cook for 6 whistles.'] } });
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${todaySlot.id}/recipe`, { token, body: { recipeVersionId: recipe.data.version.id } })).status, 200);
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${todaySlot.id}`, { token, body: { notes: 'Gate code 4321, pay cook on Friday' } })).status, 200);

    // Cook links: owners/members create; cooks cannot. The public view is token-only and sanitised.
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/cook-links`, { token: cook, body: { planId: plan.id } })).status, 403);
    const link = await call('POST', `/kitchen-circle/households/${householdId}/cook-links`, { token: member, body: { planId: plan.id, slotId: todaySlot.id, language: 'hi' } });
    assert.equal(link.status, 201, JSON.stringify(link.data));
    assert.match(link.data.path, /^\/cook\/[A-Za-z0-9_-]{30,}$/);
    assert.equal(link.data.link.tokenHash, undefined);
    const cookToken = link.data.path.split('/').pop();
    const view = await call('GET', `/kitchen-circle/cook/${cookToken}`);
    assert.equal(view.status, 200, JSON.stringify(view.data));
    const [day] = view.data.view.days;
    assert.deepEqual([day.date, day.title, day.servings, day.cooking], [today, 'Rajma Chawal', 4, true]);
    assert.deepEqual(day.ingredients.map((i: { name: string; quantity: number | null; unit: string }) => `${i.quantity} ${i.unit} ${i.name}`), ['300 g rajma', '2 cup rice', 'null to taste salt']);
    assert.ok(['fallback', 'ok', 'partial'].includes(view.data.view.translation));
    const raw = JSON.stringify(view.data);
    for (const secret of ['Gate code', 'price', 'paise', 'address', 'chat', 'Cook Owner', 'email', 'preferences']) assert.ok(!raw.includes(secret), `cook view leaked ${secret}`);
    const english = await call('GET', `/kitchen-circle/cook/${cookToken}?language=en`);
    assert.equal(english.data.view.translation, 'not_needed');
    assert.equal((await call('GET', `/kitchen-circle/households/${householdId}/cook-week`, { token: cook })).status, 200);
    // Read-aloud: only parts of this link's own view; bad requests are rejected; no model key → a plain 503.
    const speak = (body: unknown, as?: string) => as
      ? call('POST', `/kitchen-circle/households/${householdId}/cook-week/speech`, { token: as, body })
      : call('POST', `/kitchen-circle/cook/${cookToken}/speech`, { body });
    assert.equal((await speak({ date: todaySlot.plannedFor, part: 'recipe' })).status, 400);
    assert.equal((await speak({ date: '2030-01-01', part: 'ingredients' })).status, 404);
    assert.equal((await speak({ date: todaySlot.plannedFor, part: 'step', index: 39 })).status, 404);
    assert.ok([201, 503].includes((await speak({ date: todaySlot.plannedFor, part: 'ingredients' })).status));
    assert.ok([201, 503].includes((await speak({ date: todaySlot.plannedFor, part: 'step', index: 0 }, cook)).status));
    assert.equal((await call('GET', '/kitchen-circle/speech/not-a-key')).status, 400);
    assert.equal((await call('GET', `/kitchen-circle/speech/${'0'.repeat(64)}`)).status, 404);
    assert.equal((await call('POST', `/kitchen-circle/cook-links/${link.data.link.id}/revoke`, { token })).data.link.active, false);
    assert.equal((await speak({ date: todaySlot.plannedFor, part: 'ingredients' })).status, 404);
    assert.equal((await call('GET', `/kitchen-circle/cook/${cookToken}`)).status, 404);
    assert.equal((await call('GET', '/kitchen-circle/cook/not-a-real-token-but-long-enough')).status, 404);

    // Feedback: only once the day has come; it informs planning and never edits the plan.
    const future = plan.slots.find((s: { plannedFor: string }) => s.plannedFor > today);
    if (future) assert.equal((await call('POST', `/kitchen-circle/slots/${future.id}/feedback`, { token, body: { outcome: 'loved' } })).status, 422);
    assert.equal((await call('POST', `/kitchen-circle/slots/${todaySlot.id}/feedback`, { token: member, body: { outcome: 'loved' } })).status, 201);
    const fb = await call('GET', `/kitchen-circle/plans/${plan.id}/feedback`, { token: member });
    assert.deepEqual(fb.data.days.find((d: { slotId: string }) => d.slotId === todaySlot.id), { slotId: todaySlot.id, mine: 'loved', counts: { loved: 1 } });

    // Notifications: others are told about changes (cooks included for day changes), never the actor; settings are respected.
    await call('POST', '/kitchen-circle/lab/notify-tick', { body: {} });
    const types = async (as: string) => ((await call('GET', '/user/notifications', { token: as })).data.notifications ?? []).map((n: { type: string }) => n.type);
    assert.ok((await types(member)).includes('planner_day_changed'));
    // The cook hears about today's/tomorrow's changes as the new menu itself; other days as the usual alert.
    assert.ok((await types(cook)).some((t: string) => t === 'planner_cook_menu' || t === 'planner_day_changed'));
    assert.ok(!(await types(token)).includes('planner_day_changed'));
    assert.equal((await call('PUT', `/kitchen-circle/households/${householdId}/my-settings`, { token: member, body: { notifyChanges: false } })).status, 200);
    assert.equal((await call('POST', `/kitchen-circle/slots/${todaySlot.id}/lock`, { token })).status, 201);
    await call('POST', '/kitchen-circle/lab/notify-tick', { body: {} });
    assert.ok(!(await types(member)).includes('planner_locked_changed'));
    // Scheduled: the Saturday nudge to plan next week and the opt-in today's-meal reminder.
    const saturday = new Date(`${today}T05:30:00Z`);
    saturday.setUTCDate(saturday.getUTCDate() + ((6 - saturday.getUTCDay() + 7) % 7));
    await call('POST', '/kitchen-circle/lab/notify-tick', { body: { now: saturday.toISOString() } });
    assert.ok((await types(token)).includes('planner_weekend_nudge'));
    assert.equal((await call('PUT', `/kitchen-circle/households/${householdId}/my-settings`, { token, body: { notifyTodayMeal: true, cookLanguage: 'ta' } })).data.settings.cookLanguage, 'ta');
    await call('POST', '/kitchen-circle/lab/notify-tick', { body: { now: `${today}T04:30:00.000Z` } });
    const todayNote = ((await call('GET', '/user/notifications', { token })).data.notifications ?? []).find((n: { type: string }) => n.type === 'planner_today_meal');
    assert.equal(todayNote?.title, 'Today: Rajma Chawal');

    // Observability and Planner Lab hooks.
    const metrics = await call('GET', '/kitchen-circle/admin/metrics?days=7', { headers: { Authorization: `Basic ${Buffer.from(ADMIN).toString('base64')}` } });
    assert.equal(metrics.status, 200, JSON.stringify(metrics.data));
    assert.ok(metrics.data.metrics.cook.linksCreated >= 1 && metrics.data.metrics.plannedDayCompletion.loved >= 1 && metrics.data.metrics.notifications.sent >= 1);
    assert.equal((await call('GET', '/kitchen-circle/admin/metrics', { token })).status, 401);
    const previews = await call('GET', '/kitchen-circle/lab/notification-previews');
    assert.equal(previews.data.previews.length, 8); // incl. the cook menu
    const aggregate = await call('POST', '/kitchen-circle/lab/aggregate', { body: { referenceDate: today, slots: [
      { slotId: 'a', plannedFor: today, servings: 4, recipeId: 'r', recipeTitle: 'Test', recipeVersionId: 'v', defaultServings: 2, ingredients: [{ name: 'onions', quantity: 2, unit: 'piece' }] },
    ] } });
    assert.equal(aggregate.data.lines[0].quantity, 4);
  });
});

describe('KitchenCircle cook menu', () => {
  it('sends a day\'s menu to the designated cook, with owner settings and role checks', async () => {
    const { token } = await signup('Menu Owner');
    const created = await call('POST', '/kitchen-circle/households', { token, body: { name: 'Menu Home', defaultServings: 4, startsOn: '2026-11-30' } });
    const householdId = created.data.household.id;
    const day = created.data.plan.slots[0] as { id: string; plannedFor: string };
    assert.equal(created.data.household.cookAutoSend, true);

    // No cook yet → a clear message, nothing sent.
    const none = await call('POST', `/kitchen-circle/households/${householdId}/cook/send-menu`, { token, body: { date: day.plannedFor } });
    assert.equal(none.status, 409, JSON.stringify(none.data));

    const join = async (role: 'member' | 'cook', name: string) => {
      const email = `menu-${role}-${rand()}@example.com`;
      const account = await call('POST', '/auth/signup', { body: { name, email, password: 'secret123' } });
      const invite = await call('POST', `/kitchen-circle/households/${householdId}/invites`, { token, body: { email, role } });
      await call('POST', `/kitchen-circle/invites/${invite.data.invite.token}/accept`, { token: account.data.session.token });
      return { token: account.data.session.token as string, id: account.data.user?.id ?? account.data.session.userId };
    };
    const member = await join('member', 'Menu Member');
    const cook = await join('cook', 'Lata Cook');
    const members = (await call('GET', `/kitchen-circle/households/${householdId}/members`, { token })).data.members as Array<{ userId: string; role: string }>;
    const cookId = members.find((m) => m.role === 'cook')!.userId;
    const memberId = members.find((m) => m.role === 'member')!.userId;

    // Only a cook can be the designated cook; only the owner sets it.
    assert.equal((await call('PATCH', `/kitchen-circle/households/${householdId}`, { token, body: { designatedCookUserId: memberId } })).status, 422);
    assert.equal((await call('PATCH', `/kitchen-circle/households/${householdId}`, { token: member.token, body: { cookAutoSend: false } })).status, 403);
    const set = await call('PATCH', `/kitchen-circle/households/${householdId}`, { token, body: { designatedCookUserId: cookId, cookAutoSend: false } });
    assert.deepEqual([set.data.household.designatedCookUserId, set.data.household.cookAutoSend], [cookId, false]);

    // Plan Dal Tadka, then a member sends the day to the cook (works even with auto-send off).
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${day.id}/recipe`, { token, body: { recipeVersionId: 'c1a00000-0000-4000-8000-000000000101' } })).status, 200);
    const sent = await call('POST', `/kitchen-circle/households/${householdId}/cook/send-menu`, { token: member.token, body: { date: day.plannedFor } });
    assert.equal(sent.status, 201, JSON.stringify(sent.data));
    assert.equal(sent.data.cook, 'Lata');
    assert.match(sent.data.body, /Dal Tadka for 4\. The recipe is ready in your language/);
    const inbox = (await call('GET', '/user/notifications', { token: cook.token })).data.notifications as Array<{ type: string; title: string }>;
    assert.ok(inbox.some((n) => n.type === 'planner_cook_menu' && /Dal Tadka/.test(n.title)), JSON.stringify(inbox));

    // Cooks receive the menu; they can't send it.
    assert.equal((await call('POST', `/kitchen-circle/households/${householdId}/cook/send-menu`, { token: cook.token, body: { date: day.plannedFor } })).status, 403);
  });
});

describe('KitchenCircle permissions and household management', () => {
  async function household(name: string, startsOn = '2026-11-23') {
    const owner = await signup(`${name} Owner`);
    const created = await call('POST', '/kitchen-circle/households', { token: owner.token, body: { name, defaultServings: 3, startsOn } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const join = async (role: 'member' | 'cook') => {
      const email = `${role}-${rand()}@example.com`;
      const account = await call('POST', '/auth/signup', { body: { name: `${name} ${role}`, email, password: 'secret123' } });
      const invite = await call('POST', `/kitchen-circle/households/${created.data.household.id}/invites`, { token: owner.token, body: { email, role } });
      assert.equal(invite.status, 201, JSON.stringify(invite.data));
      assert.equal((await call('POST', `/kitchen-circle/invites/${invite.data.invite.token}/accept`, { token: account.data.session.token })).status, 201);
      return { token: account.data.session.token as string, id: account.data.user.id as string };
    };
    return { owner, householdId: created.data.household.id as string, plan: created.data.plan, join };
  }

  it('enforces the owner / member / cook / outsider permission matrix', async () => {
    const h = await household('Matrix');
    const member = await h.join('member');
    const cook = await h.join('cook');
    const outsider = await signup('Matrix Outsider');
    const roles = { owner: h.owner.token, member: member.token, cook: cook.token, outsider: outsider.token } as const;
    const slot = h.plan.slots[0];
    const expect = async (label: string, method: string, path: (role: string) => string, body: (role: string) => unknown, statuses: Record<keyof typeof roles, number>) => {
      for (const [role, token] of Object.entries(roles)) {
        const res = await call(method, path(role), { token, body: body(role) });
        assert.equal(res.status, statuses[role as keyof typeof roles], `${label} as ${role}: ${JSON.stringify(res.data)}`);
      }
    };
    const hid = h.householdId;
    await expect('read plan', 'GET', () => `/kitchen-circle/households/${hid}/plans?weekStart=${h.plan.weekStart}`, () => undefined, { owner: 200, member: 200, cook: 200, outsider: 403 });
    await expect('edit a day', 'PATCH', () => `/kitchen-circle/slots/${slot.id}`, (r) => r === 'outsider' ? { servings: 2 } : { servings: 2 }, { owner: 200, member: 200, cook: 403, outsider: 403 });
    await expect('members list', 'GET', () => `/kitchen-circle/households/${hid}/members`, () => undefined, { owner: 200, member: 200, cook: 200, outsider: 403 });
    await expect('household settings', 'PATCH', () => `/kitchen-circle/households/${hid}`, () => ({ defaultServings: 3 }), { owner: 200, member: 403, cook: 403, outsider: 403 });
    await expect('invite list', 'GET', () => `/kitchen-circle/households/${hid}/invites`, () => undefined, { owner: 200, member: 403, cook: 403, outsider: 403 });
    await expect('send invite', 'POST', () => `/kitchen-circle/households/${hid}/invites`, (r) => ({ email: `matrix-${r}-${rand()}@example.com` }), { owner: 201, member: 403, cook: 403, outsider: 403 });
    await expect('create rule', 'POST', () => `/kitchen-circle/households/${hid}/rules`, () => ({ weekday: 6, strength: 'preference', category: 'effort', constraint: { effort: ['easy'] } }), { owner: 201, member: 201, cook: 403, outsider: 403 });
    await expect('own attendance', 'PATCH', () => `/kitchen-circle/slots/${slot.id}/attendance`, () => ({ status: 'attending' }), { owner: 200, member: 200, cook: 200, outsider: 403 });
    await expect('chat', 'GET', () => `/kitchen-circle/households/${hid}/chat`, () => undefined, { owner: 200, member: 200, cook: 403, outsider: 403 });
    await expect('cook link', 'GET', () => `/kitchen-circle/households/${hid}/cook-links`, () => undefined, { owner: 200, member: 200, cook: 403, outsider: 403 });
    await expect('cook week', 'GET', () => `/kitchen-circle/households/${hid}/cook-week`, () => undefined, { owner: 200, member: 200, cook: 200, outsider: 403 });
    await expect('recipes', 'GET', () => `/kitchen-circle/households/${hid}/recipes`, () => undefined, { owner: 200, member: 200, cook: 200, outsider: 403 });
    await expect('cart capabilities', 'GET', () => `/kitchen-circle/households/${hid}/cart-capabilities`, () => undefined, { owner: 200, member: 200, cook: 403, outsider: 403 });
    await expect('auto-fill', 'GET', () => `/kitchen-circle/plans/${h.plan.id}/proposals/latest`, () => undefined, { owner: 200, member: 200, cook: 200, outsider: 403 });
    await expect('lock a day', 'POST', () => `/kitchen-circle/slots/${slot.id}/lock`, () => undefined, { owner: 201, member: 201, cook: 403, outsider: 403 });
    assert.equal((await call('GET', '/kitchen-circle/status')).data.enabled, true);
  });

  it('manages invitations by phone, members, private preferences, attendance and week-scoped rules', async (t) => {
    const h = await household('Manage', '2026-11-23');
    const hid = h.householdId;
    const owner = h.owner.token;

    // Phone invitation: accepted by the account with that phone, whatever formatting the owner typed.
    const invitee = await signup('Phone Invitee');
    const local = invitee.phone;
    const invite = await call('POST', `/kitchen-circle/households/${hid}/invites`, { token: owner, body: { phone: `+91 ${local.slice(0, 5)} ${local.slice(5)}`, role: 'member' } });
    assert.equal(invite.status, 201, JSON.stringify(invite.data));
    assert.match(invite.data.invite.path, /^\/kitchen-circle\/join\//);
    assert.equal((await call('POST', `/kitchen-circle/households/${hid}/invites`, { token: owner, body: { phone: local } })).status, 409);
    const other = await signup('Wrong Phone');
    assert.equal((await call('POST', `/kitchen-circle/invites/${invite.data.invite.token}/accept`, { token: other.token })).status, 403);
    const resent = await call('POST', `/kitchen-circle/invites/${invite.data.invite.id}/resend`, { token: owner });
    assert.notEqual(resent.data.invite.token, invite.data.invite.token);
    assert.equal((await call('POST', `/kitchen-circle/invites/${invite.data.invite.token}/accept`, { token: invitee.token })).status, 404);
    assert.equal((await call('POST', `/kitchen-circle/invites/${resent.data.invite.token}/accept`, { token: invitee.token })).status, 201);
    assert.equal((await call('POST', `/kitchen-circle/households/${hid}/invites`, { token: owner, body: { phone: local } })).status, 409);
    const revoked = await call('POST', `/kitchen-circle/households/${hid}/invites`, { token: owner, body: { email: `revoke-${rand()}@example.com`, role: 'cook' } });
    assert.equal((await call('POST', `/kitchen-circle/invites/${revoked.data.invite.id}/revoke`, { token: owner })).status, 201);
    const invites = (await call('GET', `/kitchen-circle/households/${hid}/invites`, { token: owner })).data.invites;
    assert.deepEqual(invites.map((i: { status: string }) => i.status).sort(), ['accepted', 'revoked']);
    assert.ok(invites.every((i: { token?: string }) => i.token === undefined));

    // Household settings and members (names and roles only).
    assert.equal((await call('PATCH', `/kitchen-circle/households/${hid}`, { token: owner, body: { name: 'Manage Home', defaultServings: 5 } })).data.household.defaultServings, 5);
    const members = (await call('GET', `/kitchen-circle/households/${hid}/members`, { token: invitee.token })).data.members;
    assert.deepEqual(members.map((m: { role: string }) => m.role), ['owner', 'member']);
    assert.ok(members.every((m: Record<string, unknown>) => Object.keys(m).sort().join() === 'joinedAt,name,role,userId,you'));

    // Preferences are private to their author.
    const pref = await call('POST', `/kitchen-circle/households/${hid}/preferences`, { token: invitee.token, body: { strength: 'cannot_eat', category: 'allergen', value: 'peanuts' } });
    assert.equal(pref.status, 201);
    assert.equal((await call('GET', `/kitchen-circle/households/${hid}/preferences/mine`, { token: invitee.token })).data.preferences.length, 1);
    assert.equal((await call('GET', `/kitchen-circle/households/${hid}/preferences/mine`, { token: owner })).data.preferences.length, 0);
    assert.equal((await call('DELETE', `/kitchen-circle/households/${hid}/preferences/${pref.data.preference.id}`, { token: owner })).status, 404);

    // Attendance, recurring absence and reactions in the per-day summary.
    const [mon, tue, wed] = h.plan.slots;
    const inviteeId = members.find((m: { role: string }) => m.role === 'member').userId;
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${mon.id}/attendance`, { token: invitee.token, body: { status: 'absent' } })).status, 200);
    assert.equal((await call('POST', `/kitchen-circle/households/${hid}/rules`, { token: owner, body: { weekday: 1, strength: 'hard', category: 'absence', constraint: { user_id: inviteeId } } })).status, 201);
    assert.equal((await call('PATCH', `/kitchen-circle/slots/${wed.id}/reaction`, { token: invitee.token, body: { reaction: 'not_for_me' } })).status, 200);
    const people = (await call('GET', `/kitchen-circle/plans/${h.plan.id}/people`, { token: invitee.token })).data.days;
    const day = (id: string) => people.find((d: { slotId: string }) => d.slotId === id);
    assert.deepEqual([day(mon.id).eating, day(mon.id).people, day(mon.id).mine], [1, 2, 'absent']);
    assert.deepEqual([day(tue.id).eating, day(tue.id).mine], [1, 'absent']); // recurring Tuesday absence
    assert.deepEqual(day(wed.id).reactions, { looksGood: 0, notForMe: 1, mine: 'not_for_me' });

    // Members can leave; the owner can't; the owner can remove.
    assert.equal((await call('DELETE', `/kitchen-circle/households/${hid}/members/${members[0].userId}`, { token: owner })).status, 409);
    assert.equal((await call('DELETE', `/kitchen-circle/households/${hid}/members/${inviteeId}`, { token: invitee.token })).status, 200);
    assert.equal((await call('GET', `/kitchen-circle/households/${hid}/members`, { token: invitee.token })).status, 403);

    // “Just this week” rules apply only to their week (needs the planner).
    const thisWeekRule = await call('POST', `/kitchen-circle/households/${hid}/rules`, { token: owner, body: { weekday: 0, strength: 'hard', category: 'cuisine', constraint: { cuisine: 'Thai' }, appliesToWeekStart: h.plan.weekStart } });
    assert.equal(thisWeekRule.data.rule.appliesToWeekStart, h.plan.weekStart);
    const now = await call('POST', `/kitchen-circle/plans/${h.plan.id}/autofill`, { token: owner, body: {} });
    if (now.status === 503 && process.env.E2E_REQUIRE_INTELLIGENCE !== '1') { t.skip('intelligence service offline'); return; }
    assert.ok(now.data.proposal.unfilled.some((u: { plannedFor: string }) => u.plannedFor === mon.plannedFor));
    const next = await call('POST', `/kitchen-circle/households/${hid}/plans/next`, { token: owner, body: { referenceDate: '2026-11-23' } });
    const later = await call('POST', `/kitchen-circle/plans/${next.data.plan.id}/autofill`, { token: owner, body: {} });
    assert.ok(later.data.proposal.items.some((i: { plannedFor: string }) => i.plannedFor === '2026-11-30'));

    // Chat: “Just this week” stores a week-scoped rule after confirmation.
    const asked = await call('POST', `/kitchen-circle/households/${hid}/chat`, { token: owner, body: { planId: h.plan.id, body: 'vegetarian on Friday' } });
    const card = asked.data.actions[0];
    assert.equal(card.status, 'needs_clarification');
    const answered = await call('POST', `/kitchen-circle/chat/actions/${card.id}/clarify`, { token: owner, body: { optionIndex: 1 } });
    const pending = answered.data.actions[0];
    assert.equal(pending.status, 'needs_confirmation');
    assert.equal((await call('POST', `/kitchen-circle/chat/actions/${pending.id}/confirm`, { token: owner })).data.action.status, 'confirmed');
    const rules = (await call('GET', `/kitchen-circle/households/${hid}/rules`, { token: owner })).data.rules;
    assert.ok(rules.some((r: { weekday: number; appliesToWeekStart: string | null; constraint: { diet?: string } }) => r.weekday === 4 && r.constraint.diet === 'vegetarian' && r.appliesToWeekStart === h.plan.weekStart));
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
