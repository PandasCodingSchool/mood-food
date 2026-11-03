import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Chip, Icon, IconButton, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, TopBar } from '../../src/components/v2';
import {
  clarifyChatAction, confirmChatAction, getChatProgress, getKitchenCirclePlan, indiaDate, listChat, mondayOfDate, newClientId, rejectChatAction, sendChat, sendChatVoice,
  type ChatActionCard, type ChatMessage, type KitchenCirclePlan, type KitchenCircleSlot,
} from '../../src/features/kitchen-circle/api';
import { kc } from '../../src/features/kitchen-circle/brand';
import { KcButton as Button, KcLoader, KcMicIcon, KcSpinner } from '../../src/features/kitchen-circle/components';
import { MAX_VOICE_SECONDS, useVoiceNote, type VoiceClip } from '../../src/features/kitchen-circle/voice';

const POLL_MS = 15_000;
const SUGGESTIONS = ['Rajma chawal Monday, pav bhaji Tuesday', 'We are going out Friday', 'Make dal tadka on Wednesday', 'Leftovers tomorrow', 'Fill the rest of the week'];
const statusLabel: Record<ChatActionCard['status'], string> = {
  applied: 'Done', needs_confirmation: 'Needs confirmation', needs_clarification: 'Question', confirmed: 'Confirmed',
  rejected: 'Dismissed', failed: 'Couldn’t apply', expired: 'Expired',
};
const PROGRESS_MS = 600;
const stateLabel: Record<KitchenCircleSlot['state'], string> = {
  blank: 'Nothing planned', planned: 'Planned', locked: 'Locked', leftovers: 'Leftovers', no_cook: 'No cooking', household_out: 'Eating out',
};
const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
const plusDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const time = (value: string) => new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

/** Shared household planner chat. Every change appears as an action card that members can audit. */
/** What the loader says while the assistant works. */
function thinkingLabel(busy: string, sending: string | null, messages: ChatMessage[]): string {
  if (busy === 'send') return sending && /\brecipe\b/i.test(sending) ? 'Haldi is writing the recipe…' : 'Haldi is thinking…';
  const id = busy.replace(/-(\d+|confirm|reject)$/, '');
  const card = messages.flatMap((m) => m.actions).find((a) => a.id === id);
  const index = Number(busy.split('-').pop());
  const option = card?.clarification?.options[index]?.label ?? '';
  if (/\(AI\)$/.test(option)) return 'Writing the recipe…';
  return card?.policy === 'ai_recipe_review' ? 'Approving and planning…' : 'Updating the plan…';
}

export default function KitchenCircleChatScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { householdId, planId, weekStart } = useLocalSearchParams<{ householdId: string; planId: string; weekStart?: string }>();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/kitchen-circle' as never));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  // Shown as the member's bubble while KitchenCircle works on it.
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Live steps of the message being handled ("Pav Bhaji isn't in your recipes yet", "Writing the recipe…").
  const [steps, setSteps] = useState<string[]>([]);
  const [planOpen, setPlanOpen] = useState(false);
  const planOpenRef = useRef(false);
  useEffect(() => { planOpenRef.current = planOpen; }, [planOpen]);
  const [weeks, setWeeks] = useState<KitchenCirclePlan[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const focused = useRef(false);

  const refresh = useCallback(async (quiet = false) => {
    if (!householdId || !planId) return;
    if (!quiet) setLoading(true);
    try { setMessages(await listChat(householdId, planId)); setError(null); }
    catch (err) { if (!quiet) setError(err instanceof Error ? err.message : 'Could not load the chat'); }
    finally { if (!quiet) setLoading(false); }
  }, [householdId, planId]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void refresh();
    // Other members' messages arrive by polling while the chat is open.
    const timer = setInterval(() => { if (focused.current) void refresh(true); }, POLL_MS);
    return () => { focused.current = false; clearInterval(timer); };
  }, [refresh]));

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [messages.length, sending, busy]);

  const act = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key); setNotice(null);
    try { await action(); await refresh(true); }
    catch (err) { setNotice(err instanceof Error ? err.message : 'Something went wrong'); }
    finally { setBusy(null); }
  };

  // Sends a message (typed or voice) and follows its live steps until the reply is posted.
  const dispatch = (placeholder: string, run: (clientId: string) => Promise<unknown>) => {
    const clientId = newClientId();
    setSending(placeholder); setSteps([]);
    let next = 0;
    let live = true;
    const poll = async () => {
      if (!live) return;
      try {
        const p = await getChatProgress(householdId, clientId, next);
        next = p.next;
        if (p.events.length && live) {
          setSteps((prev) => [...prev, ...p.events.map((e) => e.text)]);
          // A voice note's bubble becomes the words we heard.
          const heard = p.events.map((e) => /^Heard: “(.*)”$/.exec(e.text)?.[1]).find(Boolean);
          if (heard && !heard.endsWith('…')) setSending(heard);
        }
        if (p.done) return;
      } catch { /* progress is best-effort */ }
      if (live) setTimeout(() => void poll(), PROGRESS_MS);
    };
    setTimeout(() => void poll(), 250);
    void act('send', () => run(clientId)).finally(() => {
      live = false; setSending(null); setSteps([]);
      if (planOpenRef.current) void loadPlan();
    });
  };

  const send = (text = draft) => {
    const body = text.trim();
    if (!body) return;
    setDraft('');
    dispatch(body, (clientId) => sendChat(householdId, planId, body, clientId));
  };

  const sendVoice = (clip: VoiceClip) => dispatch(`Voice message · ${clip.seconds}s`, (clientId) => sendChatVoice(householdId, planId, clip.base64, clip.mimeType, clientId, clip.seconds));
  const voice = useVoiceNote(sendVoice);
  const clock = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

  // The week(s) the chat can change: the open plan's week and the next one, if it's been started.
  const loadPlan = useCallback(async () => {
    if (!householdId) return;
    const start = weekStart ?? mondayOfDate(indiaDate());
    setPlanLoading(true);
    const found = await Promise.all([start, plusDays(start, 7)].map((w) => getKitchenCirclePlan(householdId, w).catch(() => null)));
    setWeeks(found.filter((p): p is KitchenCirclePlan => !!p && p.slots.length > 0));
    setPlanLoading(false);
  }, [householdId, weekStart]);

  const openPlan = () => { setPlanOpen(true); void loadPlan(); };

  // Days the assistant just changed (applied in the last 10 minutes), so the plan view can point them out.
  const touched = new Set(messages.filter((m) => Date.now() - new Date(m.createdAt).getTime() < 600_000)
    .flatMap((m) => m.actions).filter((a) => a.status === 'applied' || a.status === 'confirmed')
    .map((a) => (a.payload as { slot_id?: string }).slot_id).filter((id): id is string => !!id));

  const card = (action: ChatActionCard) => {
    const done = ['applied', 'confirmed'].includes(action.status);
    return <Surface key={action.id} radius={14} style={{ padding: 12, gap: 8, marginTop: 6, borderWidth: 1, borderColor: colors.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* The assistant's message already asks the question; the card only carries the answers. */}
        <Text variant="bodyStrong15" style={{ flex: 1 }}>{action.status === 'needs_clarification' ? 'Choose an answer' : action.payload.summary ?? action.actionType}</Text>
        <Chip label={statusLabel[action.status]} size="sm" variant={done ? 'soft' : action.status.startsWith('needs') ? 'accent' : 'glass'} icon={done ? 'check' : undefined} />
      </View>
      {action.policyNote ? <Text variant="caption13" tone="ink2">{action.policyNote}</Text> : null}
      {action.status === 'needs_clarification' && action.clarification ? <View style={{ gap: 6 }}>
        {action.clarification.options.map((option, index) => <Button key={option.label} label={option.label} size="sm" variant="glass" block loading={busy === `${action.id}-${index}`}
          onPress={() => void act(`${action.id}-${index}`, () => clarifyChatAction(action.id, index))} />)}
        <Button label="Never mind" size="sm" variant="ghost" onPress={() => void act(`${action.id}-reject`, () => rejectChatAction(action.id))} />
      </View> : null}
      {action.status === 'needs_confirmation' ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label={action.policy === 'ai_recipe_review' ? 'Approve & plan' : 'Confirm'} size="sm" style={{ flex: 1 }} loading={busy === `${action.id}-confirm`} onPress={() => void act(`${action.id}-confirm`, () => confirmChatAction(action.id))} />
        <Button label="Dismiss" size="sm" variant="glass" style={{ flex: 1 }} loading={busy === `${action.id}-reject`} onPress={() => void act(`${action.id}-reject`, () => rejectChatAction(action.id))} />
      </View> : null}
      {action.actionType === 'REQUEST_AUTOFILL' && done && action.result?.proposalId ? <Button label="Review suggestions" size="sm" variant="glass" iconLeft="auto_awesome"
        onPress={() => router.push({ pathname: '/kitchen-circle/autofill', params: { planId } } as never)} /> : null}
      {(action.actionType === 'CREATE_RECIPE' && done || action.policy === 'ai_recipe_review') && typeof (action.result?.recipeId ?? action.payload.recipe_id) === 'string' ? <Button label="Review recipe" size="sm" variant="glass" iconLeft="auto_stories"
        onPress={() => router.push({ pathname: '/kitchen-circle/recipes', params: { householdId, openRecipeId: String(action.result?.recipeId ?? action.payload.recipe_id) } } as never)} /> : null}
      {action.actionType === 'CREATE_GROCERY_SNAPSHOT' && done ? <Button label="Open grocery list" size="sm" variant="glass" iconLeft="shopping_bag"
        onPress={() => router.push({ pathname: '/kitchen-circle/groceries', params: { householdId, planId } } as never)} /> : null}
    </Surface>;
  };

  const pendingCount = messages.flatMap((m) => m.actions).filter((a) => a.status.startsWith('needs')).length;

  return <View style={{ flex: 1 }}><StatusBar style={dark ? 'light' : 'dark'} /><Screen><TopBar onBack={leave} title="Haldi" subtitle={pendingCount ? `${pendingCount} waiting for a decision` : 'Your kitchen agent · the whole household sees this chat'} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {loading ? <KcLoader label="Loading chat" /> : error ? <ErrorBlock message={error} onRetry={() => void refresh()} /> : <ScrollView ref={scroll} contentContainerStyle={{ padding: space.gutter, gap: 10, paddingBottom: 72 }} keyboardShouldPersistTaps="handled">
        {!messages.length ? <Surface radius={20} style={{ padding: 18, gap: 10 }}>
          <Text variant="bodyStrong16">Hi, I’m Haldi. Tell me what’s changing.</Text>
          <Text variant="caption13" tone="ink2">Small edits happen straight away and show up here for everyone. Locked days, whole-week changes, rules and grocery lists wait for a member to confirm.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{SUGGESTIONS.map((s) => <Button key={s} label={s} size="sm" variant="glass" onPress={() => send(s)} />)}</View>
        </Surface> : null}
        {messages.map((message) => {
          const mine = message.role === 'member';
          return <View key={message.id} style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
            <View style={{ maxWidth: '88%', width: message.actions.length ? '88%' : undefined }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                {mine ? null : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: kc.haldi }} />}
                <Text variant="caption13" tone="ink2">{mine ? message.authorName ?? 'Member' : 'Haldi'} · {time(message.createdAt)}</Text>
              </View>
              <View style={{ backgroundColor: mine ? colors.accSoft : colors.surf, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: mine ? 0 : 1, borderColor: colors.line, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                <Text variant="body14">{message.body}</Text>
              </View>
              {message.actions.map(card)}
            </View>
          </View>;
        })}
        {/* Optimistic bubble only until the stored message arrives, so it never shows twice. */}
        {sending && !messages.some((m) => m.role === 'member' && m.body.trim() === sending) ? <View style={{ alignItems: 'flex-end' }}>
          <View style={{ maxWidth: '88%', backgroundColor: colors.accSoft, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 }}><Text variant="body14">{sending}</Text></View>
        </View> : null}
        {/* Interpreting a message, writing a recipe, or applying a choice can take a few seconds: show the brand loader.
            A fixed width, not maxWidth: the step lines use flex: 1, and on Android a shrink-wrapped bubble squeezes them to one letter per line. */}
        {busy === 'send' ? <View style={{ alignItems: 'flex-start' }}>
          <Surface radius={16} style={{ padding: 14, gap: 8, width: '88%', borderWidth: 1, borderColor: colors.line }} accessibilityLiveRegion="polite">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <KcSpinner size={34} />
              <Text variant="bodyStrong15" style={{ flex: 1 }}>{steps.length ? `${steps[steps.length - 1]}…` : thinkingLabel(busy, sending, messages)}</Text>
            </View>
            {steps.slice(0, -1).slice(-4).map((step, i) => <View key={`${i}-${step}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
              <Icon name="check" size={14} color={kc.curryLeaf} />
              <Text variant="caption13" tone="ink2" style={{ flex: 1 }}>{step}</Text>
            </View>)}
          </Surface>
        </View> : busy && busy !== 'refresh' ? <View style={{ alignItems: 'flex-start' }}>
          <KcLoader size={48} label={thinkingLabel(busy, sending, messages)} />
        </View> : null}
        {notice ? <Text variant="caption13" tone="accText">{notice}</Text> : null}
      </ScrollView>}
      {/* Floating “View plan” island: check the week (and what just changed) without leaving the chat. */}
      <View pointerEvents="box-none" style={{ alignItems: 'flex-end', paddingHorizontal: space.gutter, marginTop: -54, marginBottom: 8 }}>
        <Pressable onPress={openPlan} accessibilityRole="button" accessibilityLabel="View this week's plan"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
            backgroundColor: kc.curryLeaf, transform: [{ scale: pressed ? 0.96 : 1 }], boxShadow: '0px 10px 24px -10px rgba(31,74,54,0.6)' })}>
          <Icon name="calendar_today" size={18} color={kc.chawal} />
          <Text variant="bodyStrong15" color={kc.chawal}>View plan</Text>
          {touched.size ? <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: kc.haldi, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text variant="micro12" color={kc.kadhai}>{touched.size}</Text>
          </View> : null}
        </Pressable>
      </View>
      {voice.error ? <Pressable onPress={voice.clearError} style={{ paddingHorizontal: space.gutter, paddingBottom: 6 }}><Text variant="caption13" tone="accText">{voice.error}</Text></Pressable> : null}
      {voice.recording ? <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: space.gutter, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}
        accessibilityLiveRegion="polite">
        <IconButton icon="close" label="Cancel voice message" onPress={() => void voice.cancel()} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: kc.leafTint, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kc.mirchi }} />
          <Text variant="bodyStrong15" color={kc.curryLeafDeep} style={{ flex: 1 }} numberOfLines={1}>Listening… say the days and dishes</Text>
          <Text variant="caption13" color={kc.curryLeafDeep}>{clock(voice.seconds)} / {clock(MAX_VOICE_SECONDS)}</Text>
        </View>
        <Pressable onPress={() => void voice.stop()} accessibilityRole="button" accessibilityLabel="Send voice message"
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: kc.curryLeaf, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
          <Icon name="arrow_upward" size={22} color={kc.chawal} />
        </Pressable>
      </View> : <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: space.gutter, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line }}>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Ask Haldi — e.g. We're going out Friday" placeholderTextColor={colors.ink2} accessibilityLabel="Message Haldi and the household"
          onSubmitEditing={() => send()} returnKeyType="send" editable={busy !== 'send'}
          style={{ flex: 1, borderWidth: 1, borderColor: colors.line, color: colors.ink, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 }} />
        {/* Empty box: the button talks (voice note). With text: it sends. */}
        {draft.trim() ? <IconButton icon="arrow_upward" label="Send message" onPress={() => send()} disabled={busy === 'send'} />
          : <Pressable onPress={() => void voice.start()} disabled={busy === 'send'} accessibilityRole="button" accessibilityLabel="Talk to KitchenCircle"
            style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: kc.curryLeaf, opacity: busy === 'send' ? 0.5 : 1, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
            <KcMicIcon size={22} />
          </Pressable>}
      </View>}
    </KeyboardAvoidingView>
    <Modal visible={planOpen} transparent animationType="slide" onRequestClose={() => setPlanOpen(false)}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(28,38,32,0.35)' }} onPress={() => setPlanOpen(false)} accessibilityLabel="Close plan" />
      <View style={{ maxHeight: '78%', backgroundColor: colors.solid, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line, marginBottom: 8 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.gutter, paddingBottom: 8 }}>
          <Text variant="display26" style={{ flex: 1, fontSize: 22 }}>Your plan</Text>
          <IconButton icon="refresh" label="Refresh plan" onPress={() => void loadPlan()} />
          <IconButton icon="close" label="Close plan" onPress={() => setPlanOpen(false)} />
        </View>
        {planLoading && !weeks.length ? <KcLoader label="Loading the plan" /> : <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: 36, gap: 6 }}>
          {weeks.map((week, w) => <View key={week.id} style={{ gap: 6 }}>
            <Text variant="label" tone="ink2" style={{ marginTop: w ? 14 : 0 }}>{w ? 'NEXT WEEK' : 'THIS WEEK'}</Text>
            {week.slots.map((slot) => {
              const fresh = touched.has(slot.id);
              const past = slot.plannedFor < indiaDate();
              return <View key={slot.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, opacity: past ? 0.55 : 1,
                backgroundColor: fresh ? kc.haldiTint : colors.surf, borderWidth: 1, borderColor: fresh ? kc.haldi : colors.line }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption13" tone="ink2">{dayName(slot.plannedFor)}</Text>
                  <Text variant="bodyStrong15">{slot.mealTitle ?? stateLabel[slot.state]}</Text>
                  <Text variant="caption13" tone="ink2">{[slot.mealTitle && slot.state !== 'planned' ? stateLabel[slot.state] : null, slot.mealTitle ? `serves ${slot.servings}` : null].filter(Boolean).join(' · ')}</Text>
                </View>
                {slot.state === 'locked' ? <Icon name="lock" size={16} tone="ink2" /> : null}
                {fresh ? <Chip label="Just updated" size="sm" variant="accent" icon="check" /> : null}
              </View>;
            })}
          </View>)}
          {!planLoading && !weeks.length ? <Text variant="body14" tone="ink2">No plan for this week yet.</Text> : null}
        </ScrollView>}
      </View>
    </Modal></Screen></View>;
}
