// 2.0 Quests & streaks: real streak and quest progress from /quests.
// Completed quests double as badges (there's no separate badges API yet).
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { palette, space } from '@moodfood/tokens';
import { Icon, IconTile, ProgressBar, Screen, SectionHeader, Surface, Text, useTheme, type IconName } from '@moodfood/ui';
import { AppTabBar, LoadingBlock, TopBar } from '../src/components/v2';
import { fetchQuests, type Quest } from '../src/services/quests';

const QUEST_STYLE: Record<string, { icon: IconName; hue: number }> = {
  try_3_cuisines: { icon: 'explore', hue: 300 },
  mood_streak_7: { icon: 'local_fire_department', hue: 40 },
  adventure_score: { icon: 'radar', hue: 270 },
};
const styleFor = (key: string) => QUEST_STYLE[key] ?? { icon: 'military_tech' as IconName, hue: 150 };

export default function QuestsScreen() {
  const { colors, dark } = useTheme();
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setQuests(await fetchQuests());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const streak = quests.reduce((max, q) => Math.max(max, q.streakCount || 0), 0);
  const active = quests.filter((q) => q.status !== 'completed');
  const completed = quests.filter((q) => q.status === 'completed');
  const streakQuest = quests.find((q) => q.key === 'mood_streak_7');

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen withTabBar overlay={<AppTabBar />} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.acc} />}>
        <TopBar title="Quests & streaks" />

        <View style={{ marginHorizontal: space.gutter, marginTop: 18, borderRadius: 30, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20, backgroundColor: colors.acc, boxShadow: `0px 30px 50px -26px ${colors.acc}` }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text variant="label" color={palette.onAccent}>Mood streak</Text>
              <Text variant="display64" style={{ marginTop: 8 }} color={palette.onAccent}>
                {String(streak)}
                <Text variant="display26" style={{ fontSize: 24 }} color={palette.onAccent}>{streak === 1 ? ' day' : ' days'}</Text>
              </Text>
            </View>
            <Icon name="local_fire_department" size={44} color={palette.onAccent} filled />
          </View>
          {streakQuest ? (
            <>
              <Text variant="body13" color={palette.onAccent} style={{ marginTop: 10 }}>
                {streakQuest.status === 'completed' ? 'Week-long streak complete.' : `${Math.max(0, streakQuest.target - streakQuest.progress)} more check-ins to a full week`}
              </Text>
              <ProgressBar value={streakQuest.progress / streakQuest.target} height={8} color={palette.onAccent} style={{ marginTop: 12, backgroundColor: 'rgba(11,20,34,0.18)' }} />
            </>
          ) : (
            <Text variant="body13" color={palette.onAccent} style={{ marginTop: 10 }}>Check in every day to keep it going.</Text>
          )}
        </View>

        {loading ? (
          <LoadingBlock label="Loading quests" />
        ) : (
          <>
            <SectionHeader title="Active quests" />
            <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
              {active.length === 0 ? (
                <Text variant="body13" tone="ink2">Nothing active right now. Check back soon for new challenges.</Text>
              ) : (
                active.map((q) => {
                  const s = styleFor(q.key);
                  return (
                    <Surface key={q.key} radius={22} padding={14} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                      <IconTile icon={s.icon} hue={s.hue} size={48} />
                      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                          <Text variant="bodyStrong15" style={{ flex: 1 }}>{q.title}</Text>
                          <Text variant="button13" style={{ fontFamily: 'GeistMono_500Medium', fontSize: 12.5 }} tone="accText">{`${q.progress}/${q.target}`}</Text>
                        </View>
                        <Text variant="caption12" tone="ink2">{q.description}</Text>
                        <ProgressBar value={q.progress / q.target} />
                      </View>
                    </Surface>
                  );
                })
              )}
            </View>

            {quests.length ? <SectionHeader title="Badges" action={`${completed.length} of ${quests.length}`} /> : null}
            <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {quests.map((q) => {
                const s = styleFor(q.key);
                const on = q.status === 'completed';
                return (
                  <Surface key={q.key} radius={22} style={{ flexBasis: '30%', flexGrow: 1, paddingTop: 16, paddingBottom: 14, paddingHorizontal: 8, alignItems: 'center', gap: 10 }} accessibilityLabel={`${q.title}, ${on ? 'earned' : 'locked'}`}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? undefined : colors.tint, borderWidth: on ? 0 : 1.5, borderStyle: 'dashed', borderColor: colors.track, opacity: on ? 1 : 0.7 }}>
                      {on ? <IconTile icon={s.icon} hue={s.hue} size={56} /> : <Icon name={s.icon} size={28} tone="ink2" />}
                    </View>
                    <Text variant="micro12" align="center" style={{ fontFamily: 'Geist_600SemiBold' }} tone={on ? 'ink' : 'ink2'}>{q.title}</Text>
                  </Surface>
                );
              })}
            </View>
          </>
        )}
      </Screen>
    </View>
  );
}
