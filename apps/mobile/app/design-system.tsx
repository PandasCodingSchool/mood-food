// Dev-only gallery for the MoodFood 2.0 design system (@moodfood/ui).
// Open /design-system. Pick "Live" to theme from the real clock, weather and
// today's check-in, or pin a time/weather/mood to preview any of the 64 themes.
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect } from 'expo-router';
import {
  MOOD_SPECS,
  MOODS,
  TIME_SPECS,
  TIMES_OF_DAY,
  WEATHER_SPECS,
  WEATHERS,
  space,
  type Mood,
  type TimeOfDay,
  type Weather,
} from '@moodfood/tokens';
import {
  Button,
  Checkbox,
  Chip,
  DishImage,
  FilterChip,
  Icon,
  IconButton,
  IconTile,
  LevelBars,
  ListRow,
  MatchBadge,
  MoodOrb,
  MoodThemeProvider,
  OtpBox,
  ProgressBar,
  ProgressRing,
  Radio,
  Screen,
  SectionHeader,
  SegmentedControl,
  SegmentProgress,
  StepDots,
  Surface,
  TabBar,
  Text,
  Toggle,
  ToastProvider,
  useTheme,
  useToast,
  type IconName,
} from '@moodfood/ui';
import { useLiveMoodContext } from '../src/hooks/useLiveMoodContext';

type Pinned = { time: TimeOfDay; weather: Weather; mood: Mood };

export default function DesignSystemScreen() {
  const live = useLiveMoodContext();
  const [useLive, setUseLive] = useState(true);
  const [pinned, setPinned] = useState<Pinned>({ time: 'evening', weather: 'rainy', mood: 'tired' });
  if (!__DEV__) return <Redirect href="/" />;
  const ctx = useLive ? live : pinned;
  return (
    <MoodThemeProvider time={ctx.time} weather={ctx.weather} mood={ctx.mood}>
      <ToastProvider>
        <Gallery
          useLive={useLive}
          setUseLive={setUseLive}
          ctx={ctx}
          temperature={live.temperature}
          setPinned={(p) => {
            // Leaving live mode starts from the live context, then applies the pick.
            const base = useLive ? { time: live.time, weather: live.weather, mood: live.mood } : null;
            setPinned((cur) => ({ ...(base ?? cur), ...p }));
            setUseLive(false);
          }}
        />
      </ToastProvider>
    </MoodThemeProvider>
  );
}

function Gallery({ useLive, setUseLive, ctx, temperature, setPinned }: {
  useLive: boolean;
  setUseLive: (v: boolean) => void;
  ctx: Pinned;
  temperature: number | null;
  setPinned: (p: Partial<Pinned>) => void;
}) {
  const { colors } = useTheme();
  const toast = useToast();
  const [energy, setEnergy] = useState(2);
  const [seg, setSeg] = useState('orders');
  const [on, setOn] = useState(true);
  const [pay, setPay] = useState('upi');
  const [chk, setChk] = useState(false);
  const [veg, setVeg] = useState(true);
  const [tab, setTab] = useState('home');

  return (
    <View style={{ flex: 1 }}>
      <Screen
        withTabBar
        overlay={
          <TabBar
            tabs={[
              { key: 'home', label: 'Home', icon: 'home' },
              { key: 'feed', label: 'For you', icon: 'auto_awesome' },
              { key: 'games', label: 'Play', icon: 'stadia_controller' },
              { key: 'profile', label: 'You', icon: 'person' },
            ]}
            active={tab}
            onTabPress={setTab}
            onCenterPress={() => toast('Mood check-in')}
          />
        }
      >
        <View style={{ paddingHorizontal: space.page, paddingTop: 10 }}>
          <Text variant="label" tone="ink2">
            {`${MOOD_SPECS[ctx.mood].label} · ${WEATHER_SPECS[ctx.weather].label}${temperature != null && useLive ? ` ${Math.round(temperature)}°` : ''} · ${TIME_SPECS[ctx.time].label}`}
          </Text>
          <Text variant="display36" style={{ marginTop: 4 }}>
            Design system
          </Text>
          <Text variant="body15" tone="ink2" style={{ marginTop: 6 }}>
            MoodFood 2.0 · ambient glass
          </Text>
        </View>

        {/* Context controls */}
        <SectionHeader title="Context" />
        <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
          <Row>
            <FilterChip label="Live" icon="location_on" selected={useLive} onPress={() => setUseLive(true)} />
          </Row>
          <Row>
            {TIMES_OF_DAY.map((t) => (
              <FilterChip key={t} label={TIME_SPECS[t].label} selected={!useLive && ctx.time === t} onPress={() => setPinned({ time: t })} />
            ))}
          </Row>
          <Row>
            {WEATHERS.map((w) => (
              <FilterChip key={w} label={WEATHER_SPECS[w].label} icon={WEATHER_SPECS[w].icon as IconName} selected={!useLive && ctx.weather === w} onPress={() => setPinned({ weather: w })} />
            ))}
          </Row>
          <Row>
            {MOODS.map((m) => (
              <FilterChip key={m} label={MOOD_SPECS[m].label} selected={!useLive && ctx.mood === m} onPress={() => setPinned({ mood: m })} />
            ))}
          </Row>
        </View>

        {/* Colour */}
        <SectionHeader title="Colour" />
        <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(['acc', 'acc2', 'accSoft', 'accText', 'ink', 'ink2', 'solid', 'surf', 'surf2', 'tint', 'track', 'line'] as const).map((k) => (
            <View key={k} style={{ width: 80, gap: 6 }}>
              <View style={{ height: 48, borderRadius: 14, backgroundColor: colors[k], borderWidth: 1, borderColor: colors.line }} />
              <Text variant="labelSmall" tone="ink2">
                {k}
              </Text>
            </View>
          ))}
        </View>

        {/* Type */}
        <SectionHeader title="Type" />
        <Surface style={{ marginHorizontal: space.gutter, gap: 8 }} padding={18}>
          <Text variant="label" tone="ink2">Eyebrow · Geist Mono</Text>
          <Text variant="display40">What's tonight for?</Text>
          <Text variant="display28">Butter Chicken & Garlic Naan</Text>
          <Text variant="title21">More for your mood</Text>
          <Text variant="bodyStrong15">Kesar Da Dhaba · 32 min · ₹420</Text>
          <Text variant="body13" tone="ink2">
            Your energy's low and it's pouring outside — rich, slow-cooked and the kind of comfort that asks nothing of you.
          </Text>
        </Surface>

        {/* Hero card */}
        <SectionHeader title="Hero pick" />
        <DishImage caption="photo · butter chicken · naan" height={410} radius={30} scrim shimmer style={{ marginHorizontal: space.gutter, boxShadow: '0px 30px 60px -28px rgba(0,0,0,0.6)' }}>
          <View style={{ position: 'absolute', top: 16, left: 16, flexDirection: 'row', gap: 6 }}>
            <MatchBadge percent={96} icon="auto_awesome" />
            <Chip variant="photo" label="Top for rain" />
          </View>
          <View style={{ position: 'absolute', left: 20, right: 20, bottom: 20, gap: 6 }}>
            <Text variant="label" color="rgba(255,255,255,0.7)">Your dinner pick</Text>
            <Text variant="display28" tone="white">Butter Chicken & Garlic Naan</Text>
            <Text variant="caption13" tone="photo2">Kesar Da Dhaba · 32 min · ₹420</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Button label="Order now" size="md" style={{ flex: 1 }} onPress={() => toast('Added to cart')} />
              <Button label="See why" size="md" variant="photo" />
            </View>
          </View>
        </DishImage>

        {/* Rail card */}
        <SectionHeader title="Rail cards" action="See all" onAction={() => toast('See all')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.gutter, gap: 12 }}>
          {['Masala Khichdi Bowl', 'Pepper Rasam & Ghee Rice', 'Spicy Miso Ramen'].map((name, i) => (
            <Surface key={name} radius={24} style={{ width: 196 }}>
              <DishImage caption={name.split(' ')[1]?.toLowerCase()} height={146}>
                <View style={{ position: 'absolute', top: 10, left: 10 }}>
                  <MatchBadge percent={93 - i * 2} suffix="" size="sm" />
                </View>
              </DishImage>
              <View style={{ padding: 14, paddingTop: 12 }}>
                <Text variant="bodyStrong15" numberOfLines={2} style={{ minHeight: 38 }}>{name}</Text>
                <Text variant="caption12" tone="ink2" style={{ marginTop: 6 }}>The Good Bowl · 22 min</Text>
                <Text variant="bodyStrong15" style={{ marginTop: 8 }}>₹240</Text>
              </View>
            </Surface>
          ))}
        </ScrollView>

        {/* Buttons */}
        <SectionHeader title="Buttons" />
        <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
          <Button label="Show my matches" iconRight="arrow_forward" block />
          <Row>
            <Button label="Play again" variant="glass" size="md" />
            <Button label="View" variant="ink" size="sm" />
            <Button label="Checkout" variant="night" size="md" iconRight="arrow_forward" />
          </Row>
          <Button label="Log out" variant="outline" size="md" block />
          <Row>
            <IconButton icon="arrow_back" label="Back" />
            <IconButton icon="notifications" label="Notifications" badge />
            <IconButton icon="refresh" label="Refresh" />
            <IconButton icon="close" label="Not for me" variant="tint" square size={40} />
            <IconButton icon="favorite" label="Like" variant="tint" square size={40} filled iconColor={colors.accText} />
            <IconButton icon="bookmark" label="Save" variant="tint" square size={40} />
            <IconButton icon="favorite" label="Yum" variant="primary" size={66} filled />
          </Row>
        </View>

        {/* Chips */}
        <SectionHeader title="Chips" />
        <View style={{ paddingHorizontal: space.gutter, gap: 10 }}>
          <Row>
            <MatchBadge percent={96} icon="auto_awesome" />
            <Chip label="Low effort" />
            <Chip label="Most played tonight" variant="night" size="sm" />
            <Chip label="Tandoori chicken" variant="outline" />
          </Row>
          <Row>
            <FilterChip label="Vegetarian" selected={veg} onPress={() => setVeg(!veg)} />
            <FilterChip label="Quick pick" icon="bolt" />
            <FilterChip label="Healthy" icon="eco" />
          </Row>
        </View>

        {/* Inputs */}
        <SectionHeader title="Inputs" />
        <View style={{ paddingHorizontal: space.gutter, gap: 12 }}>
          <SegmentedControl options={[{ value: 'orders', label: 'Orders' }, { value: 'saved', label: 'Saved' }]} value={seg} onChange={setSeg} />
          <Surface padding={16} style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong14">Weather-aware picks</Text>
                <Text variant="caption12" tone="ink2">Rain and heat reshape your feed</Text>
              </View>
              <Toggle value={on} onChange={setOn} label="Weather-aware picks" />
            </View>
            {(['upi', 'card'] as const).map((k) => (
              <ListRow key={k} icon={k === 'upi' ? 'qr_code_2' : 'credit_card'} title={k === 'upi' ? 'UPI' : 'Card'} subtitle={k === 'upi' ? 'GPay · aarav@okaxis' : 'HDFC •••• 4821'} onPress={() => setPay(k)} chevron={false} right={<Radio selected={pay === k} />} />
            ))}
            <ListRow title="Chicken thighs" meta="400 g" onPress={() => setChk(!chk)} chevron={false} right={<Checkbox checked={chk} />} />
          </Surface>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <OtpBox digit="4" state="filled" />
            <OtpBox digit="2" state="filled" />
            <OtpBox state="active" />
            <OtpBox state="empty" />
          </View>
        </View>

        {/* Mood check-in */}
        <SectionHeader title="Mood check-in" />
        <Surface style={{ marginHorizontal: space.gutter, paddingHorizontal: 18, paddingVertical: 15, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="bolt" size={20} tone="accText" />
            <Text variant="bodyStrong15">Energy</Text>
            <Text variant="caption13" tone="ink2" style={{ marginLeft: 'auto' }}>
              {['Running on empty', 'Low', 'Steady', 'Good', 'Buzzing'][energy - 1]}
            </Text>
          </View>
          <LevelBars value={energy} onChange={setEnergy} label="Energy" />
        </Surface>
        <Surface kind="solid" elevated radius={26} padding={18} style={{ marginHorizontal: space.gutter, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <MoodOrb />
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="ink2">Reading you as</Text>
            <Text variant="display26">{MOOD_SPECS[ctx.mood].label}</Text>
          </View>
        </Surface>

        {/* Progress */}
        <SectionHeader title="Progress" />
        <Surface kind="solid" radius={26} padding={18} style={{ marginHorizontal: space.gutter, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <ProgressRing value={88} />
            <View style={{ flex: 1, gap: 8 }}>
              <Text variant="bodyStrong15">Rainy Day Regular</Text>
              <ProgressBar value={0.8} />
              <ProgressBar value={0.71} height={8} />
            </View>
          </View>
          <SegmentProgress count={6} index={2} />
          <StepDots count={3} index={1} />
        </Surface>

        {/* Tiles & rows */}
        <SectionHeader title="Tiles & rows" />
        <View style={{ paddingHorizontal: space.gutter, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[
            ['swipe', 40, 'Swipe Vibe', 'Six dishes. Swipe on instinct.'],
            ['casino', 350, 'Meal Roulette', 'Spin a wheel of mood-matched picks.'],
          ].map(([icon, hue, t, d]) => (
            <Surface key={t as string} radius={24} padding={16} style={{ flexBasis: '47%', flexGrow: 1, minHeight: 156, gap: 8 }}>
              <IconTile icon={icon as IconName} hue={hue as number} />
              <Text variant="title17" style={{ marginTop: 4 }}>{t as string}</Text>
              <Text variant="caption12" tone="ink2">{d as string}</Text>
            </Surface>
          ))}
        </View>
        <Surface style={{ marginHorizontal: space.gutter, marginTop: 12, paddingHorizontal: 6, paddingVertical: 4 }}>
          <ListRow icon="military_tech" title="Quests & badges" meta="2 close" onPress={() => toast('Quests')} />
          <ListRow icon="receipt_long" title="Order history" meta="42" onPress={() => toast('History')} />
          <ListRow icon="link" title="Swiggy" meta="Connected" onPress={() => toast('Swiggy')} />
        </Surface>
      </Screen>
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{children}</View>;
}
