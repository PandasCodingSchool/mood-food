// Pieces for the engine-driven games: the server picks each question and the
// decision; screens only render. Built on the 2.0 GameKit look.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { space } from '@moodfood/tokens';
import { Chip, DishImage, Text } from '@moodfood/ui';
import type { Decision, DishCard } from '../../services/engineGames';
import { openMeal } from '../../services/orderFlow';
import { recView } from '../../utils/recView';
import { ErrorBlock, LoadingBlock } from './index';
import { GameResult } from './GameKit';
import { RailCard } from './RecCards';

/** Big tappable dish for head-to-head picks (This or That, Bracket), from an engine dish card. */
export function EngineDishCard({ dish, onPick, crown, disabled, style }: {
  dish: DishCard;
  onPick: () => void;
  crown?: string;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPick}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Pick ${dish.name}`}
      style={[{ flex: 1, borderRadius: 28, boxShadow: '0px 24px 40px -26px rgba(0,0,0,0.55)', opacity: disabled ? 0.7 : 1 }, style]}
    >
      <DishImage uri={dish.image_url ?? undefined} caption={dish.cuisine} radius={28} scrim={0.35} style={{ flex: 1 }}>
        {crown || dish.stretch ? (
          <View style={{ position: 'absolute', top: 14, left: 14 }}>
            <Chip variant="accent" icon={crown ? 'crown' : undefined} label={crown ?? '🧭 Something new'} />
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, gap: 4 }}>
          <Text variant="title21" tone="white" numberOfLines={2}>{dish.name}</Text>
          <Text variant="caption12" tone="photo2" numberOfLines={1}>
            {[titleCase(dish.cuisine), dish.veg ? 'veg' : 'non-veg', ...dish.tags.slice(0, 2)].join(' · ')}
          </Text>
        </View>
      </DishImage>
    </Pressable>
  );
}

/** Loading / error states shared by every engine game. */
export function EngineState({ loading, error, onRetry, label }: { loading: boolean; error: string | null; onRetry: () => void; label: string }) {
  if (error) return <ErrorBlock message={error} onRetry={onRetry} />;
  if (loading) return <LoadingBlock label={label} />;
  return null;
}

/** The decision: the top dish in the result card, the other picks below, live status when matched on Swiggy. */
export function EngineResult({ decision, eyebrow, line, badge, onAgain, extra }: {
  decision: Decision;
  eyebrow: string;
  line: (name: string) => string;
  badge: string;
  onAgain: () => void;
  extra?: ReactNode;
}) {
  const router = useRouter();
  const recs = decision.recommendations.recommendations;
  const top = recs[0] ?? null;
  return (
    <>
      <GameResult
        eyebrow={eyebrow}
        line={top ? line(top.dish.name) : "Couldn't settle on one, try again"}
        rec={top}
        badge={badge}
        onAgain={onAgain}
        onEat={() => top && openMeal(router, top, 0)}
        extra={
          <>
            {extra}
            {decision.liveStatus === 'live' || decision.liveStatus === 'partial' ? (
              <Text variant="micro12" tone="accText" style={{ marginTop: 8 }}>
                {decision.liveStatus === 'live' ? 'All picks are on Swiggy near you' : 'Some picks are on Swiggy near you'}
              </Text>
            ) : null}
          </>
        }
      />
      {recs.length > 1 ? (
        <View style={{ paddingBottom: 32 }}>
          <Text variant="label" tone="ink2" style={{ paddingHorizontal: 20, paddingBottom: 10 }}>Also right for you</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: space.gutter }}>
            {recs.slice(1).map((r, i) => (
              <RailCard key={r.id} v={recView(r)} onOpen={() => openMeal(router, r, i + 1)} />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}

export function titleCase(s: string): string {
  return s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : s;
}
