// 2.0 "Play to decide": every decision game (v1 routes), Play tab target.
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { palette, space } from '@moodfood/tokens';
import { Chip, Icon, IconTile, Screen, Surface, Text, useTheme, useToast } from '@moodfood/ui';
import { AppTabBar } from '../../src/components/v2';
import { GAMES, type GameEntry } from '../../src/constants/games';

export default function GamesScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors, dark } = useTheme();
  const [featured, ...rest] = GAMES;
  const open = (g: GameEntry) => (g.comingSoon ? toast(`${g.title} is coming soon`) : router.push(g.route as never));

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen withTabBar overlay={<AppTabBar />}>
        <View style={{ paddingHorizontal: space.page, paddingTop: 10 }}>
          <Text variant="label" tone="ink2">Decision modes</Text>
          <Text variant="display36" style={{ marginTop: 4 }} accessibilityRole="header">Play to decide</Text>
          <Text variant="body14" tone="ink2" style={{ marginTop: 6 }}>Every result is already filtered to your mood.</Text>
        </View>

        <Pressable onPress={() => open(featured)} accessibilityRole="button" accessibilityLabel={featured.title}>
          <View style={{ marginHorizontal: space.gutter, marginTop: 20, height: 230, borderRadius: 30, overflow: 'hidden', backgroundColor: colors.acc, boxShadow: `0px 30px 50px -26px ${colors.acc}` }}>
            <View style={{ position: 'absolute', right: -20, top: 40, width: 130, height: 170, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.28)', transform: [{ rotate: '14deg' }] }} />
            <View style={{ position: 'absolute', right: 30, top: 30, width: 130, height: 170, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.5)', transform: [{ rotate: '4deg' }], alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={featured.icon} size={40} color={palette.onAccent} />
            </View>
            <View style={{ position: 'absolute', left: 20, bottom: 20, right: 170, gap: 6 }}>
              <Chip variant="night" size="sm" label="Most played" />
              <Text variant="display30" style={{ fontFamily: 'BricolageGrotesque_800ExtraBold' }} color={palette.onAccent}>{featured.title}</Text>
              <Text variant="caption13" color={palette.onAccent}>{featured.desc}</Text>
            </View>
          </View>
        </Pressable>

        <View style={{ paddingHorizontal: space.gutter, paddingTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {rest.map((g) => (
            <Pressable key={g.id} onPress={() => open(g)} accessibilityRole="button" accessibilityLabel={g.title} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Surface radius={24} padding={16} style={{ minHeight: 170, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <IconTile icon={g.icon} hue={g.hue} />
                  {g.comingSoon || g.tag ? <Chip size="sm" variant={g.comingSoon ? 'outline' : 'soft'} label={g.comingSoon ? 'Soon' : g.tag!} /> : null}
                </View>
                <Text variant="title17" style={{ marginTop: 4 }}>{g.title}</Text>
                <Text variant="caption12" tone="ink2">{g.desc}</Text>
                <Text variant="labelSmall" tone="ink2" style={{ marginTop: 'auto' }}>{g.time}</Text>
              </Surface>
            </Pressable>
          ))}
        </View>
      </Screen>
    </View>
  );
}
