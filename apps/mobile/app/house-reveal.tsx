// The house reveal: plays once when the brain first sorts the user into a house,
// or when they move house. Crest, name, motto, and the facts that put them there.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { space } from '@moodfood/tokens';
import { Button, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { LoadingBlock } from '../src/components/v2';
import { fetchBrain, markHouseEventSeen, unseenHouseEvent, type HouseEvent, type HouseInfo } from '../src/services/brain';
import { trackEvent } from '../src/utils/analytics';
import { hapticSuccess } from '../src/utils/haptics';

export default function HouseRevealScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const [event, setEvent] = useState<HouseEvent | null>(null);
  const [houses, setHouses] = useState<Record<string, HouseInfo>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const brain = await fetchBrain();
      const ev = (await unseenHouseEvent(brain?.house)) ?? brain?.house?.journey?.at(-1) ?? null;
      setHouses(brain?.house?.houses ?? {});
      setEvent(ev);
      setReady(true);
      if (ev) {
        hapticSuccess();
        void markHouseEventSeen(ev);
        trackEvent('house_revealed', { house: ev.house, type: ev.type });
      }
    })();
  }, []);

  const info = event ? houses[event.house] : null;
  const from = event?.from ? houses[event.from] : null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.page, paddingVertical: 40 }}>
        {!ready ? (
          <LoadingBlock label="Opening the envelope" />
        ) : !event || !info ? (
          <View style={{ gap: 16, alignItems: 'center' }}>
            <Text variant="title21" align="center">Still getting to know you</Text>
            <Text variant="body14" tone="ink2" align="center">Order a few times or play a couple of games and we'll find your house.</Text>
            <Button label="Back home" onPress={() => router.replace('/home')} />
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 14 }}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <Text variant="label" tone="ink2" align="center">
                {event.type === 'shifted' && from ? `You've moved on from ${from.name}` : 'Your food house is'}
              </Text>
            </Animated.View>
            <Animated.View entering={ZoomIn.delay(250).springify()} style={{ width: 168, height: 168, borderRadius: 84, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line }}>
              <Text style={{ fontSize: 88, lineHeight: 104 }} accessibilityLabel={`${info.name} crest`}>{info.crest}</Text>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(700).duration(450)} style={{ alignItems: 'center', gap: 6 }}>
              <Text variant="display40" align="center" accessibilityRole="header">{info.name}</Text>
              <Text variant="title19" tone="accText" align="center">{info.motto}</Text>
              <Text variant="body14" tone="ink2" align="center" style={{ marginTop: 6 }}>{info.about}</Text>
            </Animated.View>
            {event.because.length ? (
              <Animated.View entering={FadeInDown.delay(1100).duration(450)} style={{ alignSelf: 'stretch' }}>
                <Surface radius={20} padding={16} style={{ gap: 8, marginTop: 10 }}>
                  <Text variant="label" tone="ink2">Why you</Text>
                  {event.because.map((b) => (
                    <Text key={b} variant="body14">• {b}</Text>
                  ))}
                </Surface>
              </Animated.View>
            ) : null}
            <Animated.View entering={FadeInDown.delay(1400).duration(400)} style={{ alignSelf: 'stretch', gap: 10, marginTop: 14 }}>
              <Button label="See my house" onPress={() => router.replace('/house')} />
              <Button label="Back home" variant="ghost" onPress={() => router.replace('/home')} />
            </Animated.View>
          </View>
        )}
      </Screen>
    </View>
  );
}
