// Your food house: where the brain has placed you, how close the other houses are,
// what it knows about how you eat, and how your house has changed over time.
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { ProgressBar, Screen, SectionHeader, Surface, Text, useTheme } from '@moodfood/ui';
import { ErrorBlock, LoadingBlock, TopBar } from '../src/components/v2';
import { fetchBrain, type Brain } from '../src/services/brain';

export default function HouseScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const [brain, setBrain] = useState<Brain | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    const b = await fetchBrain();
    if (!b) setError(true);
    setBrain(b);
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const house = brain?.house;
  const houses = house?.houses ?? {};
  const info = house?.status === 'sorted' ? house.house_info : null;
  const lean = house ? houses[house.leaning] : null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        <TopBar title="Your house" onBack={() => router.back()} />
        {error ? (
          <ErrorBlock message="Couldn't load your house" onRetry={load} />
        ) : !brain ? (
          <LoadingBlock label="Finding your house" />
        ) : (
          <>
            <Surface radius={28} padding={20} style={{ marginHorizontal: space.gutter, marginTop: 12, alignItems: 'center', gap: 6 }}>
              {info ? (
                <>
                  <Text style={{ fontSize: 64, lineHeight: 76 }}>{info.crest}</Text>
                  <Text variant="display32" align="center" accessibilityRole="header">{info.name}</Text>
                  <Text variant="bodyStrong15" tone="accText" align="center">{info.motto}</Text>
                  <Text variant="body14" tone="ink2" align="center">{info.about}</Text>
                  {house?.since ? <Text variant="micro12" tone="ink2">Since {new Date(house.since).toLocaleDateString()}</Text> : null}
                </>
              ) : (
                <>
                  <Text variant="title21" align="center">Still getting to know you</Text>
                  <Text variant="body14" tone="ink2" align="center">
                    {lean ? `Leaning ${lean.crest} ${lean.name}. ` : ''}We sort you once we've seen enough: {house?.gate.rule ?? 'a few orders or games'}.
                  </Text>
                  {house ? <Text variant="micro12" tone="ink2">So far: {house.gate.orders} orders · {house.gate.games} games</Text> : null}
                </>
              )}
            </Surface>

            {house ? (
              <>
                <SectionHeader title="How close every house is" />
                <Surface radius={22} padding={16} style={{ marginHorizontal: space.gutter, gap: 12 }}>
                  {Object.entries(house.membership).map(([id, p]) => (
                    <View key={id} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text variant="body14">{houses[id] ? `${houses[id].crest} ${houses[id].name}` : id}</Text>
                        <Text variant="caption13" tone="ink2">{Math.round(p * 100)}%</Text>
                      </View>
                      <ProgressBar value={p} color={id === house.house ? colors.acc : undefined} />
                    </View>
                  ))}
                </Surface>
              </>
            ) : null}

            {brain.insights?.cards?.length ? (
              <>
                <SectionHeader title="About how you eat" />
                <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
                  {brain.insights.cards.filter((c) => c.kind !== 'house').map((c) => (
                    <Surface key={c.title} radius={20} padding={16} style={{ gap: 4 }}>
                      <Text variant="bodyStrong15">{c.title}</Text>
                      <Text variant="body14" tone="ink2">{c.body}</Text>
                    </Surface>
                  ))}
                </View>
              </>
            ) : null}

            {brain.facts.length ? (
              <>
                <SectionHeader title="What we know" />
                <Surface radius={22} padding={16} style={{ marginHorizontal: space.gutter, gap: 8 }}>
                  {brain.facts.map((f) => (
                    <Text key={f.id} variant="body14">• {f.text}</Text>
                  ))}
                </Surface>
              </>
            ) : null}

            {house?.journey?.length ? (
              <>
                <SectionHeader title="Your house journey" />
                <View style={{ paddingHorizontal: space.gutter, gap: 10, paddingBottom: 28 }}>
                  {[...house.journey].reverse().map((e) => (
                    <Surface key={e.at} radius={18} padding={14} style={{ gap: 4 }}>
                      <Text variant="bodyStrong15">
                        {e.type === 'shifted' && e.from && houses[e.from] ? `${houses[e.from].name} → ` : ''}
                        {houses[e.house] ? `${houses[e.house].crest} ${houses[e.house].name}` : e.house}
                      </Text>
                      <Text variant="micro12" tone="ink2">{new Date(e.at).toLocaleDateString()}{e.because.length ? ` · ${e.because.join(' · ')}` : ''}</Text>
                    </Surface>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </Screen>
    </View>
  );
}
