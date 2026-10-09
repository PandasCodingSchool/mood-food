// 2.0 Profile ("You" tab): who you are, real stats (orders, streak, quests
// done), the learned taste persona, and links. Preference editing moved to
// /settings.
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Button, IconButton, ListRow, ProgressBar, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { AppTabBar } from '../src/components/v2';
import { fetchCurrentUser, logout, type AuthUser } from '../src/services/auth';
import { fetchBrain } from '../src/services/brain';
import { fetchHistory } from '../src/services/history';
import { fetchNotifications } from '../src/services/notifications';
import { fetchQuests } from '../src/services/quests';
import { fetchLearnedProfile } from '../src/services/signals';
import type { LearnedProfile } from '../src/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [learned, setLearned] = useState<LearnedProfile | null>(null);
  const [orders, setOrders] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [questsDone, setQuestsDone] = useState(0);
  const [unread, setUnread] = useState(0);
  const [houseName, setHouseName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchCurrentUser().then(setUser).catch(() => {});
      fetchLearnedProfile().then(setLearned).catch(() => {});
      fetchHistory('ordered').then((h) => setOrders(h.length)).catch(() => {});
      fetchHistory('saved').then((h) => setSaved(h.length)).catch(() => {});
      fetchQuests().then((q) => {
        setStreak(q.reduce((m, x) => Math.max(m, x.streakCount || 0), 0));
        setQuestsDone(q.filter((x) => x.status === 'completed').length);
      });
      fetchNotifications().then((n) => setUnread(n.unreadCount || 0)).catch(() => {});
      fetchBrain().then((b) => {
        const info = b?.house?.status === 'sorted' ? b.house.house_info : null;
        setHouseName(info ? `${info.crest} ${info.name}` : null);
      });
    }, []),
  );

  const signedIn = !!user && !user.isGuest;
  const name = user?.name || (signedIn ? 'MoodFood member' : 'Guest');
  const stats = [
    { v: orders != null ? String(orders) : '–', l: 'Orders', go: () => router.push({ pathname: '/history', params: { tab: 'ordered' } }) },
    { v: String(streak), l: 'Day streak', go: () => router.push('/quests') },
    { v: String(questsDone), l: 'Quests done', go: () => router.push('/quests') },
  ];
  const moodMap = (learned?.mood_map_top ?? []).slice(0, 4);
  const maxW = Math.max(0.0001, ...moodMap.map((m) => m.weight));

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen withTabBar overlay={<AppTabBar />}>
        <View style={{ paddingHorizontal: space.page, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ width: 76, height: 76, borderRadius: 26, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center', boxShadow: `0px 16px 30px -14px ${colors.acc}` }}>
            <Text variant="display32" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }} color={colors.onAcc}>{(name[0] ?? '?').toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="display28" numberOfLines={1} accessibilityRole="header">{name}</Text>
            <Text variant="caption13" tone="ink2" style={{ marginTop: 3 }}>{user?.phone || 'Not signed in'}</Text>
          </View>
          <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
        </View>

        <View style={{ marginHorizontal: space.gutter, marginTop: 20, flexDirection: 'row', gap: 8 }}>
          {stats.map((s) => (
            <Pressable key={s.l} onPress={s.go} accessibilityRole="button" accessibilityLabel={`${s.v} ${s.l}`} style={{ flex: 1 }}>
              <Surface radius={20} style={{ paddingVertical: 14, paddingHorizontal: 10 }}>
                <Text variant="display26">{s.v}</Text>
                <Text variant="micro12" tone="ink2" style={{ marginTop: 2 }}>{s.l}</Text>
              </Surface>
            </Pressable>
          ))}
        </View>

        {learned?.persona || moodMap.length ? (
          <Surface kind="solid" elevated radius={26} padding={18} style={{ marginHorizontal: space.gutter, marginTop: 12, gap: 14 }}>
            {learned?.persona ? (
              <View>
                <Text variant="label" tone="ink2">Your food persona</Text>
                <Text variant="title21" style={{ marginTop: 4 }}>{learned.persona.archetype}</Text>
                <Text variant="body13" tone="ink2" style={{ marginTop: 4 }}>{learned.persona.blurb}</Text>
                {learned.persona.drift_line ? <Text variant="caption12" tone="accText" style={{ marginTop: 6 }}>{learned.persona.drift_line}</Text> : null}
              </View>
            ) : null}
            {moodMap.length ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text variant="bodyStrong15">Your taste profile</Text>
                  {learned?.n_signals ? <Text variant="micro12" tone="ink2">{`from ${learned.n_signals} signals`}</Text> : null}
                </View>
                {moodMap.map((m) => (
                  <View key={m.archetype} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text variant="caption13" numberOfLines={1} style={{ width: 110 }}>{m.archetype}</Text>
                    <ProgressBar value={m.weight / maxW} height={8} style={{ flex: 1 }} />
                  </View>
                ))}
              </>
            ) : null}
            {learned?.accuracy_meter ? (
              <Text variant="caption12" tone="ink2">{`${Math.round(learned.accuracy_meter.accuracy * 100)}% of our guesses have been right (${learned.accuracy_meter.n} checks)`}</Text>
            ) : null}
          </Surface>
        ) : null}

        <Surface style={{ marginHorizontal: space.gutter, marginTop: 12, paddingHorizontal: 6, paddingVertical: 4 }}>
          <ListRow icon="military_tech" title="Quests & badges" meta={`${questsDone} done`} onPress={() => router.push('/quests')} />
          <ListRow icon="auto_awesome" title="Your food house" meta={houseName ?? 'Getting to know you'} onPress={() => router.push('/house')} />
          <ListRow icon="receipt_long" title="Order history" meta={orders != null ? String(orders) : undefined} onPress={() => router.push({ pathname: '/history', params: { tab: 'ordered' } })} />
          <ListRow icon="bookmark" title="Saved dishes" meta={saved != null ? String(saved) : undefined} onPress={() => router.push({ pathname: '/history', params: { tab: 'saved' } })} />
          <ListRow icon="notifications" title="Notifications" meta={unread ? `${unread} new` : 'All read'} onPress={() => router.push('/notifications')} />
          <ListRow icon="link" title="Swiggy" meta={user?.swiggyLinked ? 'Connected' : 'Not linked'} onPress={() => router.push('/swiggy-connect')} />
          <ListRow icon="settings" title="Settings" meta="Diet, budget" onPress={() => router.push('/settings')} />
        </Surface>

        <View style={{ paddingHorizontal: space.gutter, paddingTop: 18 }}>
          {signedIn ? (
            <Button
              block
              variant="outline"
              size="md"
              label="Log out"
              onPress={async () => {
                await logout();
                router.replace('/login');
              }}
            />
          ) : (
            <Button block size="md" label="Log in or sign up" onPress={() => router.push('/login')} />
          )}
        </View>
      </Screen>
    </View>
  );
}
