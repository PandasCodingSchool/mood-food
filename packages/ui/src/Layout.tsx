import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, useWindowDimensions, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { duration, hueTile, palette, shadow, space } from '@moodfood/tokens';
import { AmbientBackground } from './Ambient';
import { Surface } from './Surface';
import { Icon, Text } from './Text';
import type { IconName } from './glyphs';
import { useTheme } from './theme';

/* ─────────────────────────── Screen ─────────────────────────── */

export interface ScreenProps extends ScrollViewProps {
  children: ReactNode;
  /** Leave room for the floating tab bar. */
  withTabBar?: boolean;
  /** Render the ambient backdrop behind this screen (default true). */
  ambient?: boolean;
  /** Non-scrolling content laid over the screen (sticky CTAs, cart bar). */
  overlay?: ReactNode;
  /** Edge-to-edge hero at the top (no top safe-area padding). */
  edgeToEdge?: boolean;
}

export function Screen({ children, withTabBar, ambient = true, overlay, edgeToEdge, contentContainerStyle, ...rest }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      {ambient ? <AmbientBackground /> : null}
      <ScrollView
        showsVerticalScrollIndicator={false}
        {...rest}
        contentContainerStyle={[
          {
            paddingTop: edgeToEdge ? 0 : insets.top + 6,
            paddingBottom: (withTabBar ? 130 : 40) + insets.bottom,
          },
          contentContainerStyle,
        ]}
      >
        {children}
      </ScrollView>
      {overlay}
    </View>
  );
}

/* ─────────────────────── Web app frame ─────────────────────── */

/** Width of the app column on wide web screens. */
export const APP_COLUMN_WIDTH = 480;

/**
 * The app is designed for phone widths. On web, at tablet/desktop widths it
 * renders as a centred column over the living ambient background instead of
 * stretching edge to edge. Native and narrow web windows pass straight through.
 */
export function WebAppFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  if (Platform.OS !== 'web' || width < 600) return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: colors.solid }}>
      <AmbientBackground animate={false} />
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: APP_COLUMN_WIDTH,
          overflow: 'hidden',
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.line,
          boxShadow: shadow.hero,
          // New containing block, so absolutely positioned bars/toasts stay in the column.
          transform: [{ translateX: 0 }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

/* ─────────────────────── Section header ─────────────────────── */

export function SectionHeader({ title, action, onAction, style }: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        { paddingHorizontal: space.page, paddingTop: 28, paddingBottom: 12, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
        style,
      ]}
    >
      <Text variant="title21" accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <Text variant="button13" tone="accText">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ─────────────────────── Tiles & rows ─────────────────────── */

/** Pastel icon tile keyed by hue (games, quests, notifications, avatars). */
export function IconTile({ icon, hue, size = 42, children }: { icon?: IconName; hue: number; size?: number; children?: ReactNode }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.33,
        backgroundColor: hueTile(hue),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon ? <Icon name={icon} size={Math.round(size * 0.52)} color={palette.onAccent} /> : children}
    </View>
  );
}

export interface ListRowProps {
  icon?: IconName;
  title: string;
  subtitle?: string;
  /** Right-aligned meta text. */
  meta?: string;
  onPress?: () => void;
  chevron?: boolean;
  right?: ReactNode;
  divider?: boolean;
}

export function ListRow({ icon, title, subtitle, meta, onPress, chevron = !!onPress, right, divider }: ListRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 12,
        paddingHorizontal: 10,
        opacity: pressed ? 0.7 : 1,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: colors.line,
      })}
    >
      {icon ? (
        <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={21} tone="accText" />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong15">{title}</Text>
        {subtitle ? (
          <Text variant="caption12" tone="ink2" style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {meta ? (
        <Text variant="caption12" tone="ink2">
          {meta}
        </Text>
      ) : null}
      {right}
      {chevron ? <Icon name="chevron_right" size={20} tone="ink2" /> : null}
    </Pressable>
  );
}

/* ─────────────────────────── Tab bar ─────────────────────────── */

export interface TabItem {
  key: string;
  label: string;
  icon: IconName;
}

export interface TabBarProps {
  /** Exactly four tabs; the mood button sits in the middle. */
  tabs: [TabItem, TabItem, TabItem, TabItem];
  active: string;
  onTabPress: (key: string) => void;
  onCenterPress: () => void;
  centerIcon?: IconName;
  centerLabel?: string;
}

export function TabBar({ tabs, active, onTabPress, onCenterPress, centerIcon = 'mood', centerLabel = 'Mood check-in' }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const tab = (t: TabItem) => {
    const on = t.key === active;
    const c = on ? colors.accText : colors.ink2;
    return (
      <Pressable
        key={t.key}
        onPress={() => onTabPress(t.key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={t.label}
        style={{ flex: 1, height: 70, alignItems: 'center', justifyContent: 'center', gap: 4 }}
      >
        <Icon name={t.icon} size={24} color={c} filled={on} />
        <Text variant="tab" color={c}>
          {t.label}
        </Text>
      </Pressable>
    );
  };
  return (
    <Surface
      kind="glass"
      radius={28}
      accessibilityRole="tablist"
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: Math.max(22, insets.bottom + 8),
        height: 70,
        backgroundColor: colors.tab,
        boxShadow: shadow.float,
        flexDirection: 'row',
        alignItems: 'center',
        overflow: 'visible',
      }}
    >
      {tabs.slice(0, 2).map(tab)}
      <View style={{ width: 84, alignItems: 'center' }}>
        <Pressable
          onPress={onCenterPress}
          accessibilityRole="button"
          accessibilityLabel={centerLabel}
          style={({ pressed }) => ({
            width: 62,
            height: 62,
            marginTop: -36,
            borderRadius: 22,
            backgroundColor: colors.acc,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0px 14px 28px -10px ${colors.acc}, 0px 0px 0px 5px ${colors.solid}`,
            transform: [{ scale: pressed ? 0.95 : 1 }],
          })}
        >
          <Icon name={centerIcon} size={30} color={colors.onAcc} />
        </Pressable>
      </View>
      {tabs.slice(2).map(tab)}
    </Surface>
  );
}

/* ─────────────────────────── Toast ─────────────────────────── */

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMsg({ id: Date.now(), text });
    timer.current = setTimeout(() => setMsg(null), duration.toast);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View
          key={msg.id}
          entering={FadeInDown.duration(200)}
          exiting={FadeOutUp.duration(200)}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0, alignItems: 'center', zIndex: 30 }}
        >
          <View style={{ paddingVertical: 11, paddingHorizontal: 16, borderRadius: 16, backgroundColor: palette.night, boxShadow: '0px 14px 30px -12px rgba(0,0,0,0.6)' }}>
            <Text variant="caption13" color={palette.white}>
              {msg.text}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
