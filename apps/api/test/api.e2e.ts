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
    assert.equal(outsiderList.length, 0);
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
