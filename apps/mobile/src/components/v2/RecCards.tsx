// Recommendation cards for 2.0 home + matches (docs/design/moodfood-2.0).
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { palette, shadow, space } from '@moodfood/tokens';
import { Button, Chip, DishImage, Icon, IconButton, MatchBadge, Surface, Text, useTheme, type IconName } from '@moodfood/ui';
import { imageCaption, metaLine, type RecView } from '../../utils/recView';

/** Big photo card with scrim, badges, copy and actions (home: 410, matches: 330). */
export function HeroPick({ v, height, eyebrow, topFor, why, onOpen, actions, topRight }: {
  v: RecView;
  height: number;
  eyebrow?: string;
  topFor?: string;
  why?: string | null;
  onOpen: () => void;
  actions?: ReactNode;
  topRight?: ReactNode;
}) {
  // The open-details target is a full-bleed sibling *behind* the content, not a
  // wrapper: a pressable wrapping the action buttons renders <button> inside
  // <button> on web (invalid HTML). Non-interactive content ignores touches so
  // taps anywhere except an action still open the dish. (box-none must be the
  // prop: react-native-web ignores it as a style.)
  return (
    <View style={{ marginHorizontal: space.gutter, borderRadius: 30, boxShadow: shadow.hero }}>
      <DishImage uri={v.imageUrl} caption={`photo · ${imageCaption(v)}`} height={height} radius={30} scrim shimmer>
        <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${v.name}. Open details`} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <View style={{ pointerEvents: 'none', flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {v.match != null ? <MatchBadge percent={v.match} icon="auto_awesome" /> : <Chip variant="accent" icon="auto_awesome" label="Top pick" />}
            {topFor ? <Chip variant="photo" label={topFor} /> : null}
          </View>
          {topRight ? <View style={{ marginLeft: 'auto' }}>{topRight}</View> : null}
        </View>
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 20, right: 20, bottom: 20, gap: 6 }}>
          <View style={{ pointerEvents: 'none', gap: 6 }}>
            {eyebrow ? <Text variant="label" color="rgba(255,255,255,0.7)">{eyebrow}</Text> : null}
            <Text variant="display28" tone="white" numberOfLines={2}>{v.name}</Text>
            <Text variant="caption13" tone="photo2" numberOfLines={1}>{metaLine(v)}</Text>
            {why ? <Text variant="body13" color="rgba(255,255,255,0.9)" numberOfLines={3} style={{ marginTop: 2 }}>{why}</Text> : null}
          </View>
          {actions ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>{actions}</View> : null}
        </View>
      </DishImage>
    </View>
  );
}

/** Compact rail card (home "More for your mood"). */
export function RailCard({ v, onOpen }: { v: RecView; onOpen: () => void }) {
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={v.name}>
      <Surface radius={24} style={{ width: 196 }}>
        <DishImage uri={v.imageUrl} caption={imageCaption(v)} height={146}>
          {v.match != null ? (
            <View style={{ position: 'absolute', top: 10, left: 10 }}>
              <MatchBadge percent={v.match} suffix="" size="sm" />
            </View>
          ) : null}
        </DishImage>
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
          <Text variant="bodyStrong15" numberOfLines={2} style={{ minHeight: 38 }}>{v.name}</Text>
          <Text variant="caption12" tone="ink2" numberOfLines={1} style={{ marginTop: 6 }}>{metaLine(v, ['restaurant', 'eta']) || v.cuisine}</Text>
          {v.priceTxt ? <Text variant="bodyStrong15" style={{ marginTop: 8 }}>{v.priceTxt}</Text> : null}
        </View>
      </Surface>
    </Pressable>
  );
}

export const VETO_REASONS = [
  { id: 'too_heavy', label: 'Too heavy' },
  { id: 'had_recently', label: 'Had it recently' },
  { id: 'too_pricey', label: 'Too pricey' },
  { id: 'not_feeling_it', label: 'Not feeling it' },
] as const;

/** Wide card with veto / like / save / share (matches "Also fits right now"). */
export function MatchCard({ v, chip, liked, saved, vetoed, choosingReason, onOpen, onVetoStart, onVeto, onLike, onSave, onShare }: {
  v: RecView;
  chip?: string;
  liked: boolean;
  saved: boolean;
  vetoed: string | null;
  choosingReason: boolean;
  onOpen: () => void;
  onVetoStart: () => void;
  onVeto: (reason: string) => void;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Surface radius={26} style={{ width: 280, opacity: vetoed ? 0.55 : 1 }}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${v.name}. Open details`}>
        <DishImage uri={v.imageUrl} caption={imageCaption(v)} height={160}>
          <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6 }}>
            {v.match != null ? <MatchBadge percent={v.match} size="sm" /> : null}
            {chip ? <Chip variant="solid" size="sm" label={chip} /> : null}
          </View>
        </DishImage>
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <Text variant="bodyStrong16" numberOfLines={2}>{v.name}</Text>
          <Text variant="caption12" tone="ink2" numberOfLines={1} style={{ marginTop: 4 }}>{metaLine(v, ['cuisine', 'eta', 'price'])}</Text>
          {v.why && !choosingReason && !vetoed ? <Text variant="caption13" numberOfLines={3} style={{ marginTop: 10 }}>{v.why}</Text> : null}
        </View>
      </Pressable>
      {vetoed ? (
        <Text variant="caption13" tone="ink2" style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
          {`Noted: ${VETO_REASONS.find((r) => r.id === vetoed)?.label.toLowerCase() ?? 'not for you'}. We'll adjust.`}
        </Text>
      ) : choosingReason ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {VETO_REASONS.map((r) => (
            <Pressable key={r.id} onPress={() => onVeto(r.id)} accessibilityRole="button" style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.line, justifyContent: 'center', backgroundColor: colors.tint }}>
              <Text variant="caption12">{r.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 12, marginTop: 'auto' }}>
          <IconButton icon="close" label="Not for me" variant="tint" square size={40} onPress={onVetoStart} />
          <IconButton icon="favorite" label={liked ? 'Unlike' : 'Like'} variant="tint" square size={40} filled={liked} iconColor={liked ? palette.like : undefined} onPress={onLike} />
          <IconButton icon="bookmark" label={saved ? 'Remove from saved' : 'Save'} variant="tint" square size={40} filled={saved} iconColor={saved ? colors.accText : undefined} onPress={onSave} />
          <IconButton icon="ios_share" label="Share" variant="tint" square size={40} onPress={onShare} />
          <Button label="View" variant="ink" size="sm" style={{ marginLeft: 'auto', height: 40, borderRadius: 14 }} onPress={onOpen} />
        </View>
      )}
    </Surface>
  );
}

/** Healthier / budget swap row. */
export function SwapRow({ label, name, delta, onPress, compact }: { label: string; name: string; delta?: string | null; onPress?: () => void; compact?: boolean }) {
  const { colors } = useTheme();
  const body = (
    <>
      <DishImage height={compact ? 48 : 64} radius={compact ? 14 : 16} stripe={7} style={{ width: compact ? 48 : 64 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="labelSmall" tone="accText">{label}</Text>
        <Text variant={compact ? 'bodyStrong14' : 'bodyStrong15'} numberOfLines={1} style={{ marginTop: 3 }}>{name}</Text>
        {delta && !compact ? <Text variant="caption12" tone="ink2" numberOfLines={2} style={{ marginTop: 2 }}>{delta}</Text> : null}
      </View>
      {compact && delta ? <Text variant="caption12" tone="ink2" numberOfLines={1} style={{ maxWidth: 110 }}>{delta}</Text> : <Icon name="chevron_right" size={22} tone="ink2" />}
    </>
  );
  const rowStyle = { padding: compact ? 10 : 12, flexDirection: 'row' as const, gap: compact ? 12 : 14, alignItems: 'center' as const };
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${name}`}>
      {compact ? (
        <View style={[rowStyle, { borderRadius: 18, borderWidth: 1, borderColor: colors.line }]}>{body}</View>
      ) : (
        <Surface radius={22} style={rowStyle}>{body}</Surface>
      )}
    </Pressable>
  );
}

/** Pill-shaped quick action (home row). */
export function QuickChip({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ height: 42, paddingLeft: 12, paddingRight: 16, borderRadius: 21, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.surf, borderWidth: 1, borderColor: colors.line }}>
      <Icon name={icon} size={18} tone="accText" />
      <Text variant="body14" style={{ fontFamily: 'Geist_500Medium', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}
