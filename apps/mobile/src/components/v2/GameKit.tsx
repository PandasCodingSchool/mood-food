// Shared pieces for the 2.0 decision games (docs/design/moodfood-2.0).
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { palette, shadow, space } from '@moodfood/tokens';
import { Button, Chip, DishImage, IconButton, MatchBadge, Surface, Text, useTheme, type IconName } from '@moodfood/ui';
import { useLiveMood } from '../../context/LiveMood';
import { getMoodRecommendations } from '../../services/moodRecs';
import type { QuizResults, Recommendation } from '../../types';
import { imageCaption, metaLine, recView } from '../../utils/recView';

/** Back · title/subtitle · restart. */
export function GameHeader({ title, subtitle, onReset }: { title: string; subtitle?: string; onReset?: () => void }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.gutter, paddingTop: 6 }}>
      <IconButton icon="arrow_back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/games'))} />
      <View style={{ alignItems: 'center', flex: 1 }}>
        <Text variant="bodyStrong16" accessibilityRole="header">{title}</Text>
        {subtitle ? <Text variant="micro12" tone="ink2">{subtitle}</Text> : null}
      </View>
      {onReset ? <IconButton icon="restart_alt" label="Start over" onPress={onReset} /> : <View style={{ width: 44 }} />}
    </View>
  );
}

/** Big tappable dish card for head-to-head picks (This or That, Bracket). */
export function DuelCard({ rec, onPick, crown, style }: { rec: Recommendation; onPick: () => void; crown?: string; style?: ViewStyle }) {
  const v = recView(rec);
  return (
    <Pressable onPress={onPick} accessibilityRole="button" accessibilityLabel={`Pick ${v.name}`} style={[{ flex: 1, borderRadius: 28, boxShadow: '0px 24px 40px -26px rgba(0,0,0,0.55)' }, style]}>
      <DishImage uri={v.imageUrl} caption={imageCaption(v)} radius={28} scrim={0.35} style={{ flex: 1 }}>
        {crown ? (
          <View style={{ position: 'absolute', top: 14, left: 14 }}>
            <Chip variant="accent" icon="crown" label={crown} />
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, gap: 4 }}>
          <Text variant="title21" tone="white" numberOfLines={2}>{v.name}</Text>
          <Text variant="caption12" tone="photo2" numberOfLines={1}>{metaLine(v, ['cuisine', 'price'])}</Text>
        </View>
      </DishImage>
    </Pressable>
  );
}

/** "or" / "vs" puck between two duel cards. */
export function VersusPuck({ label, size = 56 }: { label: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: '50%', top: '50%', width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderRadius: size / 2, backgroundColor: colors.solid, alignItems: 'center', justifyContent: 'center', zIndex: 2, boxShadow: `0px 0px 0px 6px ${colors.accSoft}, 0px 10px 24px -8px rgba(0,0,0,0.5)` }}
    >
      <Text variant="title17" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }}>{label}</Text>
    </View>
  );
}

/** Result block: eyebrow, headline, winning dish card, Play again / Let's eat this. */
export function GameResult({ eyebrow, line, rec, badge, badgeIcon = 'emoji_events', onAgain, onEat, eatLabel = "Let's eat this", extra }: {
  eyebrow: string;
  line: string;
  rec: Recommendation | null;
  badge: string;
  badgeIcon?: IconName;
  onAgain: () => void;
  onEat: () => void;
  eatLabel?: string;
  extra?: ReactNode;
}) {
  const v = rec ? recView(rec) : null;
  return (
    <Animated.View entering={FadeIn.duration(400)} style={{ paddingHorizontal: 20, paddingBottom: 36 }}>
      <Text variant="label" tone="ink2" style={{ paddingTop: 26 }}>{eyebrow}</Text>
      <Text variant="display28" style={{ marginTop: 6 }} accessibilityRole="header">{line}</Text>
      {extra}
      {v ? (
        <Animated.View entering={ZoomIn.springify().damping(14)}>
          <Pressable onPress={onEat} accessibilityRole="button" accessibilityLabel={`${v.name}. Open`}>
            <Surface kind="solid" radius={26} style={{ marginTop: 18, overflow: 'hidden', boxShadow: shadow.card }}>
              <DishImage uri={v.imageUrl} caption={imageCaption(v)} height={170}>
                <View style={{ position: 'absolute', top: 12, left: 12 }}>
                  <Chip variant="accent" icon={badgeIcon} label={badge} />
                </View>
              </DishImage>
              <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong16" numberOfLines={2}>{v.name}</Text>
                  <Text variant="caption12" tone="ink2" numberOfLines={1} style={{ marginTop: 3 }}>{metaLine(v) || v.cuisine}</Text>
                </View>
                {v.match != null ? <MatchBadge percent={v.match} suffix="" size="sm" /> : null}
              </View>
            </Surface>
          </Pressable>
        </Animated.View>
      ) : null}
      <View style={{ marginTop: 16, flexDirection: 'row', gap: 10 }}>
        <Button label="Play again" variant="glass" style={{ height: 56, borderRadius: 18 }} onPress={onAgain} />
        <Button label={eatLabel} style={{ flex: 1, height: 56, borderRadius: 18 }} onPress={onEat} />
      </View>
    </Animated.View>
  );
}

/** Real mood-matched dishes for games that duel dishes. */
export function useGameRecs(query?: QuizResults) {
  const { mood } = useLiveMood();
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await getMoodRecommendations(mood, query ? { query } : {});
      setRecs(res.recommendations);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load dishes');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood, JSON.stringify(query)]);
  useEffect(() => {
    void load();
  }, [load]);
  return { recs, error, reload: load };
}

/** Pill chip used by Story and Pantry (selectable, wraps text). */
export function ChoiceChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={{ minHeight: 40, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: on ? 'transparent' : colors.line, backgroundColor: on ? colors.acc : colors.surf, justifyContent: 'center' }}
    >
      <Text variant="body13" style={{ fontFamily: 'Geist_500Medium' }} color={on ? palette.onAccent : colors.ink}>{label}</Text>
    </Pressable>
  );
}
