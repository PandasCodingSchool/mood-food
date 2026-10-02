// 2.0 Group decision. Same flow and API as v1: start or join a room, lobby
// polls members every 3s, everyone swipes the snack cards, then the server
// returns the consensus (what nobody's miserable about).
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Pressable, Share, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { fontFamily, hueTile, palette, space } from '@moodfood/tokens';
import { Button, DishImage, IconButton, ProgressBar, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { AppTabBar, TopBar } from '../src/components/v2';
import { SNACK_CARDS } from '../src/constants/snackCards';
import { createGroup, fetchConsensus, fetchGroup, joinGroup, submitGroupSwipes, type ConsensusOption, type GroupMember } from '../src/services/groups';
import { trackEvent } from '../src/utils/analytics';

type Stage = 'landing' | 'lobby' | 'swipe' | 'results';
const HUES = [55, 210, 140, 320, 20, 260, 95, 180];
const minMatch = (o: ConsensusOption) => {
  const v = Object.values(o.member_match);
  return v.length ? Math.min(...v) : 0;
};

export default function GroupScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const [stage, setStage] = useState<Stage>('landing');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [memberKey, setMemberKey] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [swipeIdx, setSwipeIdx] = useState(0);
  const [swipes, setSwipes] = useState<Array<{ item: string; liked: boolean }>>([]);
  const [options, setOptions] = useState<ConsensusOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollLobby = useCallback(async () => {
    if (!code) return;
    const group = await fetchGroup(code);
    if (group) setMembers(group.members);
  }, [code]);

  useEffect(() => {
    if (stage !== 'lobby') return;
    void pollLobby();
    const id = setInterval(pollLobby, 3000);
    return () => clearInterval(id);
  }, [stage, pollLobby]);

  const create = async () => {
    setBusy(true);
    setError(null);
    const newCode = await createGroup();
    if (!newCode) {
      setBusy(false);
      return setError('Could not start a room. Try again.');
    }
    setCode(newCode);
    setMemberKey(await joinGroup(newCode, displayName || 'Host'));
    trackEvent('group_created', { code: newCode });
    setBusy(false);
    setStage('lobby');
  };

  const join = async () => {
    const upper = joinCode.trim().toUpperCase();
    if (!upper) return;
    setBusy(true);
    setError(null);
    const key = await joinGroup(upper, displayName || 'Guest');
    setBusy(false);
    if (!key) return setError('No room with that code.');
    setCode(upper);
    setMemberKey(key);
    trackEvent('group_joined', { code: upper });
    setStage('lobby');
  };

  const swipe = (liked: boolean) => {
    const card = SNACK_CARDS[swipeIdx];
    const next = [...swipes, { item: card.name, liked }];
    setSwipes(next);
    if (swipeIdx + 1 >= SNACK_CARDS.length) {
      if (memberKey) void submitGroupSwipes(code, memberKey, next);
      setStage('lobby');
    } else setSwipeIdx(swipeIdx + 1);
  };

  const consensus = async () => {
    setBusy(true);
    setOptions(await fetchConsensus(code));
    setBusy(false);
    setStage('results');
  };

  const swiped = members.filter((m) => m.swipeCount > 0).length;
  const iSwiped = swipes.length >= SNACK_CARDS.length;
  const ranked = [...options].sort((a, b) => minMatch(b) - minMatch(a));
  const winner = ranked[0];

  const input = (props: ComponentProps<typeof TextInput>) => (
    <Surface kind="solid" bordered radius={18} style={{ paddingHorizontal: 16 }}>
      <TextInput placeholderTextColor={colors.ink2} {...props} style={{ height: 52, color: colors.ink, fontFamily: fontFamily.bodyMedium, fontSize: 16 }} />
    </Surface>
  );

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen withTabBar overlay={stage === 'swipe' ? null : <AppTabBar />} keyboardShouldPersistTaps="handled">
        {stage === 'landing' ? (
          <>
            <TopBar />
            <View style={{ paddingHorizontal: space.page, paddingTop: 10 }}>
              <Text variant="label" tone="ink2">With friends</Text>
              <Text variant="display36" style={{ marginTop: 4 }} accessibilityRole="header">Group decision</Text>
              <Text variant="body14" tone="ink2" style={{ marginTop: 6 }}>Everyone swipes, we find what nobody's miserable about.</Text>
            </View>
            <View style={{ paddingHorizontal: space.gutter, paddingTop: 22, gap: 12 }}>
              {input({ value: displayName, onChangeText: setDisplayName, placeholder: 'Your name', accessibilityLabel: 'Your name', autoComplete: 'name' })}
              <Button block label="Start a group" iconRight="arrow_forward" loading={busy} onPress={create} />
              <Text variant="caption12" tone="ink2" align="center" style={{ marginTop: 6 }}>or join one</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  {input({ value: joinCode, onChangeText: setJoinCode, placeholder: 'Room code', accessibilityLabel: 'Room code', autoCapitalize: 'characters' })}
                </View>
                <Button label="Join" variant="night" size="md" style={{ height: 54, borderRadius: 18 }} onPress={join} />
              </View>
              {error ? <Text variant="caption13" color={palette.danger}>{error}</Text> : null}
            </View>
          </>
        ) : stage === 'lobby' ? (
          <>
            <TopBar title="Group decision" onBack={() => setStage('landing')} />
            <Surface kind="solid" elevated radius={26} padding={18} style={{ marginHorizontal: space.gutter, marginTop: 18, gap: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text variant="micro12" tone="ink2">Room code</Text>
                  <Text variant="code" style={{ marginTop: 2 }} selectable>{code}</Text>
                </View>
                <Button label="Invite" iconLeft="person_add" size="sm" style={{ height: 40, borderRadius: 14 }} onPress={() => void Share.share({ message: `Join my MoodFood group with code ${code}` })} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {members.map((m, i) => (
                  <View key={m.memberKey} style={{ alignItems: 'center', gap: 6 }} accessibilityLabel={`${m.displayName}, ${m.swipeCount > 0 ? 'done' : 'waiting'}`}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: hueTile(HUES[i % HUES.length]), alignItems: 'center', justifyContent: 'center' }}>
                      <Text variant="bodyStrong16" style={{ fontFamily: 'BricolageGrotesque_700Bold' }} color={palette.onAccent}>{(m.displayName[0] ?? '?').toUpperCase()}</Text>
                      <View style={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.solid, backgroundColor: m.swipeCount > 0 ? palette.success : colors.track }} />
                    </View>
                    <Text variant="micro11" tone="ink2" numberOfLines={1} style={{ maxWidth: 56 }}>{m.displayName}</Text>
                  </View>
                ))}
                <Text variant="caption12" tone="ink2" style={{ marginLeft: 'auto' }}>{`${swiped} of ${members.length} swiped`}</Text>
              </View>
            </Surface>
            <View style={{ paddingHorizontal: space.gutter, paddingTop: 16, gap: 10 }}>
              {!iSwiped ? (
                <Button
                  block
                  label="Swipe your picks"
                  iconRight="arrow_forward"
                  onPress={() => {
                    setSwipeIdx(0);
                    setSwipes([]);
                    setStage('swipe');
                  }}
                />
              ) : (
                <Text variant="caption13" tone="ink2" align="center">You're in. Waiting on the others…</Text>
              )}
              <Button block variant="glass" size="md" label="See the group's pick" iconLeft="military_tech" loading={busy} onPress={consensus} />
            </View>
          </>
        ) : stage === 'swipe' ? (
          <>
            <TopBar title="Your picks" subtitle={`${swipeIdx + 1} of ${SNACK_CARDS.length}`} onBack={() => setStage('lobby')} />
            <Animated.View key={swipeIdx} entering={FadeIn.duration(200)} style={{ marginHorizontal: 20, marginTop: 16, borderRadius: 30, overflow: 'hidden', boxShadow: '0px 30px 50px -24px rgba(0,0,0,0.55)' }}>
              <DishImage height={420} scrim={0.4}>
                {(() => {
                  const C = SNACK_CARDS[swipeIdx].Icon;
                  return (
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 120, alignItems: 'center', justifyContent: 'center' }}>
                      <C size={88} color={colors.accText} />
                    </View>
                  );
                })()}
                <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20, gap: 6 }}>
                  <Text variant="display28" tone="white">{SNACK_CARDS[swipeIdx].name}</Text>
                  <Text variant="caption13" tone="photo2">{SNACK_CARDS[swipeIdx].desc}</Text>
                </View>
              </DishImage>
            </Animated.View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22, paddingTop: 22 }}>
              <IconButton icon="close" label="No" variant="glass" size={66} onPress={() => swipe(false)} />
              <IconButton icon="favorite" label="Yes" variant="primary" size={66} filled onPress={() => swipe(true)} />
            </View>
          </>
        ) : (
          <>
            <TopBar title="The group's pick" onBack={() => setStage('lobby')} />
            {winner ? (
              <Animated.View entering={ZoomIn.springify().damping(13)} style={{ marginHorizontal: space.gutter, marginTop: 18, borderRadius: 30, padding: 20, backgroundColor: colors.acc, boxShadow: `0px 30px 50px -26px ${colors.acc}` }}>
                <Text variant="label" color={palette.onAccent}>{`It's a match · works for ${Object.keys(winner.member_match).length}`}</Text>
                <Text variant="display32" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold', marginTop: 8 }} color={palette.onAccent}>{winner.dish_name}</Text>
                <Text variant="caption13" color={palette.onAccent} style={{ marginTop: 8 }}>{`Everyone's at least ${Math.round(minMatch(winner))}% happy with it.`}</Text>
              </Animated.View>
            ) : (
              <Text variant="body14" tone="ink2" align="center" style={{ padding: 32 }}>No consensus yet. Get everyone to swipe, then check again.</Text>
            )}
            <View style={{ paddingHorizontal: space.gutter, paddingTop: 14, gap: 10 }}>
              {ranked.slice(winner ? 1 : 0).map((o) => (
                <Surface key={o.dish_id} radius={22} padding={14} style={{ gap: 8 }}>
                  <Text variant="bodyStrong15">{o.dish_name}</Text>
                  <ProgressBar value={minMatch(o) / 100} />
                  <Text variant="micro12" tone="ink2">{Object.entries(o.member_match).map(([n, p]) => `${n} ${Math.round(p)}%`).join(' · ')}</Text>
                </Surface>
              ))}
              <Pressable onPress={() => setStage('lobby')} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 10 }}>
                <Text variant="button13" tone="accText">Back to the room</Text>
              </Pressable>
              <Button block variant="glass" size="md" label="Done" onPress={() => router.replace('/home')} />
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}
