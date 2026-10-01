// 2.0 Story mode: write your day like a text to a friend. Keyword rules run
// on-device; only the matched tags (never the text) are sent. Tags become a
// real recommendations query, and the top dish is "plated for you".
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { fontFamily, space } from '@moodfood/tokens';
import { Button, Chip, MoodOrb, Screen, Surface, Text, useTheme, useToast, type IconName } from '@moodfood/ui';
import { ErrorBlock } from '../../src/components/v2';
import { ChoiceChip, GameHeader, GameResult, useGameRecs } from '../../src/components/v2/GameKit';
import { useLiveMood } from '../../src/context/LiveMood';
import { openMeal } from '../../src/services/orderFlow';
import { logSignal } from '../../src/services/signals';
import type { QuizResults } from '../../src/types';
import { trackEvent } from '../../src/utils/analytics';

type Rule = { re: RegExp; label: string; icon: IconName; mood?: string; craving?: string; budget?: string };
const RULES: Rule[] = [
  { re: /rain|drench|wet|soak|pour/i, label: 'Rain', icon: 'rainy', mood: 'tired', craving: 'brothy' },
  { re: /meeting|deadline|stress|work|boss|long day|hectic/i, label: 'Long day', icon: 'work', mood: 'stressed', craving: 'comfort' },
  { re: /gym|workout|run|yoga|protein/i, label: 'Worked out', icon: 'fitness_center', mood: 'happy', craving: 'fresh' },
  { re: /promot|celebrat|birthday|good news|won /i, label: 'Celebrating', icon: 'celebration', mood: 'celebrating', craving: 'cheesy' },
  { re: /new|bored|adventur|different/i, label: 'Craving new', icon: 'explore', mood: 'adventurous', craving: 'spicy' },
  { re: /tired|sleep|exhaust|drained|lazy/i, label: 'Tired', icon: 'bedtime', mood: 'tired', craving: 'comfort' },
  { re: /friend|guest|party|flatmate/i, label: 'Company', icon: 'group', mood: 'happy', craving: 'cheesy' },
  { re: /cheap|broke|budget|month end/i, label: 'On a budget', icon: 'savings', budget: 'low' },
];
const LINES = ['Got drenched on the way home.', 'Back-to-back meetings all day.', 'Hit the gym this morning.', 'Got some good news today!', 'Bored of my usual order.', "It's month end, keeping it cheap."];

export default function DayStoryScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors, dark } = useTheme();
  const { mood } = useLiveMood();
  const [text, setText] = useState('');
  const [query, setQuery] = useState<QuizResults | null>(null);
  const tags = RULES.filter((r) => r.re.test(text));
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const toggleLine = (l: string) =>
    setText((t) => (t.includes(l) ? t.replace(l, '').replace(/\s{2,}/g, ' ').trim() : `${t.trim() ? `${t.trim()} ` : ''}${l}`));

  const plate = () => {
    if (!text.trim()) return toast('Write a line, or tap one below');
    const q: QuizResults = {
      mood: tags.find((t) => t.mood)?.mood ?? mood,
      craving: tags.find((t) => t.craving)?.craving ?? 'comfort',
      budget: tags.some((t) => t.budget === 'low') ? 'low' : 'medium',
      preference: 'both',
    };
    void logSignal('day_story', { path: tags.map((t) => t.label), mood_vector: { label: tags.map((t) => t.label).join(' + ') || 'just_hungry' } });
    trackEvent('game_completed', { game: 'story', tags: tags.map((t) => t.label) });
    setQuery(q);
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <GameHeader title="Story mode" subtitle={query ? 'Plated' : 'Tell us your day'} onReset={() => setQuery(null)} />
        {!query ? (
          <>
            <View style={{ paddingHorizontal: space.page, paddingTop: 16 }}>
              <Text variant="display30" accessibilityRole="header">How was your day?</Text>
              <Text variant="body14" tone="ink2" style={{ marginTop: 8 }}>Write it like you'd text a friend. We'll plate it.</Text>
            </View>
            <Surface kind="solid" bordered radius={24} padding={16} style={{ marginHorizontal: space.gutter, marginTop: 16, gap: 10 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                placeholder="Got caught in the rain after a crazy day at work…"
                placeholderTextColor={colors.ink2}
                accessibilityLabel="Your day"
                style={{ height: 140, color: colors.ink, fontFamily: fontFamily.body, fontSize: 16, lineHeight: 24, textAlignVertical: 'top' }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="micro12" tone="ink2">{`${words} ${words === 1 ? 'word' : 'words'}`}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {tags.slice(0, 3).map((t) => (
                    <Chip key={t.label} size="sm" icon={t.icon} label={t.label} />
                  ))}
                </View>
              </View>
            </Surface>
            <Text variant="label" tone="ink2" style={{ paddingHorizontal: space.page, paddingTop: 18, paddingBottom: 8 }}>Add a line</Text>
            <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {LINES.map((l) => (
                <ChoiceChip key={l} label={l} on={text.includes(l)} onPress={() => toggleLine(l)} />
              ))}
            </View>
            <View style={{ paddingHorizontal: space.gutter, paddingTop: 22, paddingBottom: 36 }}>
              <Button block label="Plate my day" onPress={plate} />
            </View>
          </>
        ) : (
          <Plated query={query} tags={tags} onAgain={() => setQuery(null)} onOpen={(r) => openMeal(router, r, 0)} />
        )}
      </Screen>
    </View>
  );
}

function Plated({ query, tags, onAgain, onOpen }: {
  query: QuizResults;
  tags: Rule[];
  onAgain: () => void;
  onOpen: (r: NonNullable<ReturnType<typeof useGameRecs>['recs']>[number]) => void;
}) {
  const { recs, error, reload } = useGameRecs(query);
  const shown = tags.length ? tags : [{ label: 'Just hungry', icon: 'restaurant' as IconName }];
  const tagRow = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      {shown.map((t) => (
        <Animated.View key={t.label} entering={ZoomIn.springify().damping(14)}>
          <Chip icon={t.icon} label={t.label} />
        </Animated.View>
      ))}
    </View>
  );
  if (error) return <ErrorBlock message={error} onRetry={reload} />;
  if (!recs) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, paddingHorizontal: 32, paddingBottom: 80 }}>
        <MoodOrb />
        <Text variant="display26" align="center">Reading between the lines…</Text>
        {tagRow}
      </View>
    );
  }
  const top = recs[0] ?? null;
  return (
    <GameResult
      eyebrow="What we heard"
      extra={tagRow}
      line={tags.length ? `${tags.slice(0, 2).map((t) => t.label).join(' + ')} → ${top?.dish.name.toLowerCase() ?? 'comfort'}.` : "Nothing jumped out, so here's your safest bet."}
      rec={top}
      badge="Plated for you"
      onAgain={onAgain}
      onEat={() => top && onOpen(top)}
    />
  );
}
