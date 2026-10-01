// 2.0 Craving Radar: tap a flavour map (light → rich, mild → fiery). The 13
// craving sensations sit on the map; the three nearest your tap become your
// cravings (same 'craving' signal + /recommendations hand-off as v1).
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { space } from '@moodfood/tokens';
import { Button, Icon, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { GameHeader } from '../../src/components/v2/GameKit';
import { CRAVING_TAGS } from '../../src/constants/cravingTags';
import { useLiveMood } from '../../src/context/LiveMood';
import { logSignal } from '../../src/services/signals';
import { trackEvent } from '../../src/utils/analytics';

// x: 0 light → 1 rich, y: 0 mild → 1 fiery.
const POS: Record<string, [number, number]> = {
  fresh: [0.12, 0.3], tangy: [0.3, 0.72], brothy: [0.32, 0.28], crunchy: [0.44, 0.5], sweet: [0.42, 0.14],
  crispy: [0.58, 0.58], spicy: [0.6, 0.92], juicy: [0.66, 0.38], smoky: [0.8, 0.74], cheesy: [0.84, 0.36],
  melty: [0.76, 0.14], creamy: [0.9, 0.2],
};
const H = 340;

export default function CravingRadarScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const { mood } = useLiveMood();
  const mapRef = useRef<View>(null);
  const [pt, setPt] = useState<{ fx: number; fy: number } | null>(null);
  const tags = CRAVING_TAGS.filter((t) => POS[t.id]);

  const rich = pt ? (pt.fx - 0.06) / 0.88 : 0;
  const fiery = pt ? 1 - (pt.fy - 0.06) / 0.88 : 0;
  const hits = pt
    ? tags
        .map((t) => ({ t, d: Math.hypot(POS[t.id][0] - rich, POS[t.id][1] - fiery) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3)
    : [];
  const near = new Set(hits.map((h) => h.t.id));
  const zoneA = rich < 0.4 ? 'Light' : rich > 0.6 ? 'Rich' : 'Balanced';
  const zoneB = fiery < 0.4 ? 'mild' : fiery > 0.6 ? 'fiery' : 'medium';
  const zone = zoneA === 'Balanced' && zoneB === 'medium' ? 'Right down the middle' : `${zoneA} & ${zoneB}`;

  const go = () => {
    const selected = hits.map((h) => h.t.id);
    void logSignal('craving', { tags: selected });
    trackEvent('game_completed', { game: 'craving_radar', tags: selected });
    const results = { mood, craving: selected[0] || 'comfort', budget: 'medium', preference: 'both', gameData: { type: 'craving_radar', cravingTags: selected } };
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  const axis = (label: string, style: object, icon?: boolean) => (
    <View style={[{ position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 3 }, style]} pointerEvents="none">
      {icon ? <Icon name="local_fire_department" size={14} tone="ink2" /> : null}
      <Text variant="label" tone="ink2">{label}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen>
        <GameHeader title="Craving Radar" subtitle={pt ? 'Tap again to move' : 'Tap the map'} onReset={() => setPt(null)} />
        <View style={{ paddingHorizontal: space.page, paddingTop: 16 }}>
          <Text variant="display30" accessibilityRole="header">Where does your craving live?</Text>
          <Text variant="body14" tone="ink2" style={{ marginTop: 8 }}>Tap the map. We'll find what's closest.</Text>
        </View>

        <Pressable
          ref={mapRef}
          onPress={(e) => {
            // pageX/pageY exist on native and web (locationX doesn't on web).
            const { pageX, pageY } = e.nativeEvent;
            mapRef.current?.measureInWindow((x, y, width, height) => {
              if (!width || !height) return;
              const fx = Math.min(0.97, Math.max(0.03, (pageX - x) / width));
              const fy = Math.min(0.97, Math.max(0.03, (pageY - y) / height));
              setPt({ fx, fy });
            });
          }}
          accessibilityLabel="Flavour map. Left is light, right is rich, top is fiery, bottom is mild."
          style={{ marginHorizontal: space.gutter, marginTop: 16 }}
        >
          <Surface radius={30} style={{ height: H }}>
            <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 300, height: 300, marginLeft: -150, marginTop: -150, borderRadius: 150, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 200, height: 200, marginLeft: -100, marginTop: -100, borderRadius: 100, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 100, height: 100, marginLeft: -50, marginTop: -50, borderRadius: 50, backgroundColor: colors.accSoft, opacity: 0.5 }} />
            <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, top: '50%', height: 1, backgroundColor: colors.line }} />
            <View pointerEvents="none" style={{ position: 'absolute', top: 16, bottom: 16, left: '50%', width: 1, backgroundColor: colors.line }} />
            {axis('Fiery', { top: 12, alignSelf: 'center', left: 0, right: 0, justifyContent: 'center' }, true)}
            {axis('Mild', { bottom: 12, left: 0, right: 0, justifyContent: 'center' })}
            {axis('Light', { left: 14, top: H / 2 + 6 })}
            {axis('Rich', { right: 14, top: H / 2 + 6 })}
            {tags.map((t) => {
              const on = near.has(t.id);
              const [x, y] = POS[t.id];
              return (
                <View key={t.id} pointerEvents="none" style={{ position: 'absolute', left: `${6 + x * 88}%`, top: `${6 + (1 - y) * 88}%`, alignItems: 'center', gap: 4, transform: [{ translateX: -24 }, { translateY: -5 }], width: 48, zIndex: on ? 2 : 1 }}>
                  <View style={{ width: on ? 12 : 9, height: on ? 12 : 9, borderRadius: 6, backgroundColor: on ? colors.acc : colors.ink2, opacity: on ? 1 : 0.55 }} />
                  <Text variant="micro11" style={{ fontFamily: 'Geist_600SemiBold', fontSize: 10.5, opacity: pt && !on ? 0.55 : 1 }} tone={on ? 'ink' : 'ink2'} numberOfLines={1}>{t.label}</Text>
                </View>
              );
            })}
            {pt ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: `${pt.fx * 100}%`, top: `${pt.fy * 100}%`, width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: 13, backgroundColor: colors.acc, borderWidth: 3, borderColor: colors.solid, zIndex: 3, boxShadow: `0px 0px 0px 10px ${colors.accSoft}, 0px 0px 0px 24px ${colors.accSoft}` }} />
            ) : null}
          </Surface>
        </Pressable>

        {!pt ? (
          <View style={{ paddingTop: 18, paddingBottom: 36, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <Icon name="touch_app" size={20} tone="ink2" />
            <Text variant="body13" tone="ink2">Tap anywhere on the map</Text>
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: space.page, paddingTop: 22, paddingBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text variant="title21">{zone}</Text>
              <Text variant="caption12" tone="ink2">Closest 3</Text>
            </View>
            <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
              {hits.map((h) => {
                const T = h.t.Icon;
                return (
                  <Surface key={h.t.id} radius={22} padding={12} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <T size={22} color={colors.accText} />
                    </View>
                    <Text variant="bodyStrong15" style={{ flex: 1 }}>{h.t.label}</Text>
                    <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: colors.acc, justifyContent: 'center' }}>
                      <Text variant="chip12" color={colors.onAcc}>{`${Math.max(62, Math.round(99 - h.d * 70))}%`}</Text>
                    </View>
                  </Surface>
                );
              })}
            </View>
            <View style={{ paddingHorizontal: space.gutter, paddingTop: 16, paddingBottom: 36 }}>
              <Button block label={`Find ${zone.toLowerCase()} food`} iconRight="arrow_forward" onPress={go} />
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}
