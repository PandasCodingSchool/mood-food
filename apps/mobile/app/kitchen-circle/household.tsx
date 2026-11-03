import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Icon, Screen, SegmentedControl, Surface, Text, Toggle, useTheme } from '@moodfood/ui';
import { ErrorBlock, TopBar } from '../../src/components/v2';
import { fetchCurrentUser } from '../../src/services/auth';
import {
  createInvite, indiaDate, listActivities, sendCookMenu, listInvites, listKitchenCircleHouseholds, listMembers, removeMember, resendInvite, revokeInvite, updateHousehold,
  type Activity, type HouseholdInvite, type HouseholdMember, type KitchenCircleHousehold,
} from '../../src/features/kitchen-circle/api';
import { kc } from '../../src/features/kitchen-circle/brand';
import { KcButton as Button, KcLoader } from '../../src/features/kitchen-circle/components';

const ACTIVITY_LABELS: Record<string, string> = {
  household_created: 'Started the KitchenCircle', household_updated: 'Changed household settings', invite_created: 'Sent an invitation',
  invite_resent: 'Resent an invitation', invite_revoked: 'Cancelled an invitation', invite_accepted: 'Joined', member_left: 'Left the household',
  member_removed: 'Removed a member', slot_updated: 'Changed a day', slot_recipe_selected: 'Chose a recipe', slot_locked: 'Locked a day',
  slot_unlocked: 'Unlocked a day', attendance_updated: 'Updated who’s eating', slot_reacted: 'Reacted to a meal', rule_created: 'Added a rule',
  rule_updated: 'Changed a rule', next_week_plan_created: 'Started next week’s plan', autofill_proposed: 'Asked for suggestions',
  autofill_applied: 'Added a suggested meal', grocery_snapshot_created: 'Built a grocery list', grocery_snapshot_finalized: 'Finalized a grocery list',
  cook_link_created: 'Shared a day with the cook', meal_feedback: 'Said how a meal went', household_recipe_created: 'Added a recipe',
};
const roleLabel = { owner: 'Owner', member: 'Member', cook: 'Cook' } as const;

/** Household settings, members, invitations (email or phone, shared as a link) and the activity history. */
export default function KitchenCircleHouseholdScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { householdId } = useLocalSearchParams<{ householdId: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/kitchen-circle' as never));
  const [household, setHousehold] = useState<KitchenCircleHousehold | null>(null);
  const [role, setRole] = useState<'owner' | 'member' | 'cook'>('member');
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invites, setInvites] = useState<HouseholdInvite[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [servings, setServings] = useState('');
  const [via, setVia] = useState<'phone' | 'email'>('phone');
  const [contact, setContact] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'cook'>('member');
  const [swiggy, setSwiggy] = useState<{ linked: boolean; expiresAt: string | null } | null>(null);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true); setError(null);
    try {
      const row = (await listKitchenCircleHouseholds()).find((h) => h.household.id === householdId);
      if (!row) throw new Error('You are no longer in this KitchenCircle.');
      setHousehold(row.household); setRole(row.role); setName(row.household.name); setServings(String(row.household.defaultServings));
      setMembers(await listMembers(householdId));
      setActivity((await listActivities(householdId)).filter((a) => ACTIVITY_LABELS[a.eventType]).slice(0, 25)); // household-facing events only
      setInvites(row.role === 'owner' ? await listInvites(householdId) : []);
      if (row.role === 'owner') {
        const me = await fetchCurrentUser().catch(() => null);
        setSwiggy({ linked: !!me?.swiggyLinked, expiresAt: me?.swiggyExpiresAt ?? null });
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load the household'); }
    finally { setLoading(false); }
  }, [householdId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key); setNotice(null);
    try { await action(); } catch (err) { setNotice(err instanceof Error ? err.message : 'Something went wrong'); } finally { setBusy(null); }
  };

  /** Invitations are delivered by the owner (WhatsApp, SMS, email) — the link only works for that phone or email. */
  const share = async (url: string, who: string) => {
    const message = `Join our KitchenCircle on MoodFood so we can plan meals together: ${url}`;
    try {
      const nav = (globalThis as { navigator?: { share?: unknown; clipboard?: { writeText: (t: string) => Promise<void> } } }).navigator;
      if (Platform.OS === 'web' && nav && !nav.share && nav.clipboard) { await nav.clipboard.writeText(url); setNotice(`Invite link for ${who} copied: ${url}`); return; }
      await Share.share({ message, url });
      setNotice(`Invitation ready for ${who}. It only works when they sign in with that ${via === 'phone' ? 'phone number' : 'email'}.`);
    } catch { setNotice(`Send ${who} this link: ${url}`); }
  };

  const owner = role === 'owner';
  const input = { borderWidth: 1, borderColor: colors.line, color: colors.ink, borderRadius: 16, padding: 12, backgroundColor: kc.raised } as const;

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen><TopBar onBack={leave} title="Household" subtitle={household?.name} />
    <ScrollView contentContainerStyle={{ padding: space.gutter, gap: 12, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {loading ? <KcLoader label="Loading the household" /> : error ? <ErrorBlock message={error} onRetry={load} /> : <>
        {notice ? <Surface radius={16} style={{ padding: 14 }}><Text variant="caption13" selectable>{notice}</Text></Surface> : null}

        {owner ? <Surface radius={20} style={{ padding: 18, gap: 10 }}>
          <Text variant="label" tone="ink2">SETTINGS</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Household name" placeholderTextColor={colors.ink2} style={input} accessibilityLabel="Household name" />
          <TextInput value={servings} onChangeText={setServings} keyboardType="number-pad" placeholder="Usual servings" placeholderTextColor={colors.ink2} style={input} accessibilityLabel="Usual servings" />
          <Button label="Save" size="md" variant="outline" loading={busy === 'save'} onPress={() => void run('save', async () => {
            const count = Number(servings);
            if (!name.trim() || !Number.isInteger(count) || count < 1 || count > 30) throw new Error('Enter a name and 1–30 servings.');
            setHousehold(await updateHousehold(householdId, { name: name.trim(), defaultServings: count })); setNotice('Saved.');
          })} />
        </Surface> : null}

        {owner ? (() => {
          // Swiggy tokens last 5 days with no refresh: say when it ends, and warn in the last day.
          const linked = !!swiggy?.linked;
          const until = swiggy?.expiresAt ? new Date(swiggy.expiresAt) : null;
          const soon = linked && !!until && until.getTime() - Date.now() < 24 * 60 * 60 * 1000;
          const when = until?.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
          return <Surface radius={20} style={{ padding: 18, gap: 10 }}>
            <Text variant="label" tone="ink2">SWIGGY & INSTAMART</Text>
            {linked ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: soon ? kc.haldi : kc.curryLeaf }}>
                <Icon name={soon ? 'schedule' : 'check'} size={18} color={soon ? kc.kadhai : kc.chawal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong15">{soon ? 'Swiggy connection ends soon' : 'Swiggy is connected'}</Text>
                <Text variant="caption13" tone="ink2">{when ? `${soon ? 'Ends' : 'Connected until'} ${when}. ` : ''}Grocery lists become live Instamart carts.</Text>
              </View>
            </View>
              : <Text variant="body14" tone="ink2">Connect Swiggy so grocery lists become live Instamart carts. You don’t need MoodFood for this.</Text>}
            <Button label={!linked ? 'Connect Swiggy' : soon ? 'Reconnect Swiggy' : 'Manage Swiggy connection'} size="md" variant={!linked || soon ? 'primary' : 'outline'} iconLeft={linked ? 'storefront' : 'link'}
              onPress={() => router.push({ pathname: '/kitchen-circle/swiggy', params: { householdId } } as never)} />
          </Surface>;
        })() : null}

        {(() => {
          // The household's cook gets each day's menu and recipe automatically; owners choose who and can turn it off.
          const cooks = members.filter((m) => m.role === 'cook');
          if (!household || role === 'cook') return null;
          const chosen = cooks.find((c) => c.userId === household.designatedCookUserId) ?? cooks[0];
          const tomorrow = (() => { const d = new Date(`${indiaDate()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
          return <Surface radius={20} style={{ padding: 18, gap: 10 }}>
            <Text variant="label" tone="ink2">YOUR COOK</Text>
            {!cooks.length ? <Text variant="body14" tone="ink2">Invite your cook below with the Cook role. KitchenCircle then sends them each day's menu and recipe in their language — the evening before, the morning of, and straight away if it changes.</Text> : <>
              {owner ? <Toggle label={`Send ${chosen?.name.split(' ')[0] ?? 'the cook'} the menu automatically`} value={household.cookAutoSend !== false}
                onChange={(v) => void run('cook-auto', async () => { setHousehold(await updateHousehold(householdId, { cookAutoSend: v })); })} /> : null}
              <Text variant="caption13" tone="ink2">{household.cookAutoSend !== false
                ? 'Evening before: tomorrow’s meal and recipe. Morning: today’s. Straight away if today or tomorrow changes. In their language, from their cook view.'
                : 'Automatic sending is off. You can still send a day’s menu yourself.'}</Text>
              {owner && cooks.length > 1 ? <SegmentedControl options={cooks.map((c) => ({ value: c.userId, label: c.name.split(' ')[0] }))} value={chosen?.userId ?? cooks[0].userId}
                onChange={(v) => void run('cook-pick', async () => { setHousehold(await updateHousehold(householdId, { designatedCookUserId: v })); })} /> : null}
              <Button label={`Send tomorrow’s menu to ${chosen?.name.split(' ')[0] ?? 'the cook'} now`} size="md" variant="outline" iconLeft="notifications" loading={busy === 'cook-send'}
                onPress={() => void run('cook-send', async () => { const r = await sendCookMenu(householdId, tomorrow); setNotice(`Sent to ${r.cook}: “${r.title}”.`); })} />
            </>}
          </Surface>;
        })()}

        <Surface radius={20} style={{ padding: 18, gap: 10 }}>
          <Text variant="label" tone="ink2">PEOPLE</Text>
          {members.map((m) => <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: m.role === 'cook' ? kc.kadhai : m.role === 'owner' ? kc.haldi : kc.curryLeaf }}>
              <Text variant="bodyStrong14" color={m.role === 'owner' ? kc.kadhai : kc.chawal}>{m.name[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}><Text variant="bodyStrong15">{m.name}{m.you ? ' (you)' : ''}</Text><Text variant="caption13" tone="ink2">{roleLabel[m.role]}</Text></View>
            {m.role !== 'owner' && (owner || m.you) ? <Pressable onPress={() => void run(`rm-${m.userId}`, async () => {
              await removeMember(householdId, m.userId);
              if (m.you) router.replace('/kitchen-circle' as never); else await load();
            })} accessibilityRole="button"><Text variant="caption13" color={kc.mirchi} style={{ fontFamily: 'Figtree_700Bold' }}>{m.you ? 'Leave' : 'Remove'}</Text></Pressable> : null}
          </View>)}
        </Surface>

        {owner ? <Surface radius={20} style={{ padding: 18, gap: 10 }}>
          <Text variant="label" tone="ink2">INVITE SOMEONE</Text>
          <SegmentedControl options={[{ value: 'phone', label: 'Phone' }, { value: 'email', label: 'Email' }]} value={via} onChange={(v) => { setVia(v); setContact(''); }} />
          <TextInput value={contact} onChangeText={setContact} keyboardType={via === 'phone' ? 'phone-pad' : 'email-address'} autoCapitalize="none"
            placeholder={via === 'phone' ? 'Their phone number' : 'Their email'} placeholderTextColor={colors.ink2} style={input} accessibilityLabel="Phone number or email to invite" />
          <SegmentedControl options={[{ value: 'member', label: 'Family / flatmate' }, { value: 'cook', label: 'Cook' }]} value={inviteRole} onChange={setInviteRole} />
          <Text variant="caption13" tone="ink2">{inviteRole === 'cook' ? 'Cooks see the cooking week and recipes only — never chat, prices or orders.' : 'Members plan, chat and build grocery lists with you.'}</Text>
          <Button label="Create invite link" iconLeft="person_add" block loading={busy === 'invite'} onPress={() => void run('invite', async () => {
            if (!contact.trim()) throw new Error(via === 'phone' ? 'Enter a phone number.' : 'Enter an email.');
            const invite = await createInvite(householdId, { ...(via === 'phone' ? { phone: contact.trim() } : { email: contact.trim() }), role: inviteRole });
            await share(invite.url, contact.trim()); setContact(''); setInvites(await listInvites(householdId));
          })} />
          {invites.length ? <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: kc.steel, paddingTop: 10 }}>
            {invites.map((i) => <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}><Text variant="body14">{i.phone ?? i.email}</Text><Text variant="caption13" tone="ink2">{roleLabel[i.role]} · {i.status}</Text></View>
              {i.status !== 'accepted' ? <Pressable onPress={() => void run(`re-${i.id}`, async () => { const r = await resendInvite(i.id); await share(r.url, i.phone ?? i.email ?? 'them'); setInvites(await listInvites(householdId)); })} accessibilityRole="button">
                <Text variant="caption13" tone="accText" style={{ fontFamily: 'Figtree_700Bold' }}>Resend</Text></Pressable> : null}
              {i.status === 'pending' ? <Pressable onPress={() => void run(`rv-${i.id}`, async () => { await revokeInvite(i.id); setInvites(await listInvites(householdId)); })} accessibilityRole="button">
                <Text variant="caption13" color={kc.mirchi} style={{ fontFamily: 'Figtree_700Bold' }}>Cancel</Text></Pressable> : null}
            </View>)}
          </View> : null}
        </Surface> : null}

        <Surface radius={20} style={{ padding: 18, gap: 8 }}>
          <Text variant="label" tone="ink2">RECENT ACTIVITY</Text>
          {activity.length ? activity.map((a) => <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="body14" style={{ flex: 1 }}>{ACTIVITY_LABELS[a.eventType]}</Text>
            <Text variant="caption13" tone="ink2">{new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
          </View>) : <Text variant="caption13" tone="ink2">Nothing yet.</Text>}
        </Surface>
      </>}
    </ScrollView></Screen></View>;
}
