import { useRef } from 'react';
import type { ComponentType } from 'react';
import { View, Text, Pressable, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { fw } from '../../constants/theme';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

interface SliderRowProps {
  label: string;
  IconLow?: LucideIcon;
  IconHigh?: LucideIcon;
  value: number; // 1-10
  onChange: (value: number) => void;
  accent?: string;
}

// Icon-labelled 1-10 slider built as a tappable/draggable segment track
// (no external slider dependency).
export default function SliderRow({
  label,
  IconLow,
  IconHigh,
  value,
  onChange,
  accent = '#f97316',
}: SliderRowProps) {
  const { theme } = useTheme();
  const trackWidth = useRef(0);

  const valueFromX = (x: number) => {
    if (trackWidth.current <= 0) return value;
    const ratio = Math.max(0, Math.min(1, x / trackWidth.current));
    return Math.max(1, Math.min(10, Math.round(ratio * 9) + 1));
  };

  const handleTouch = (event: GestureResponderEvent) => {
    onChange(valueFromX(event.nativeEvent.locationX));
  };

  return (
    <View style={{ marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={[fw(800), { fontSize: 15, color: theme.text }]}>{label}</Text>
        <Text style={[fw(900), { fontSize: 15, color: accent }]}>{value}/10</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {IconLow ? <IconLow size={22} color={theme.subtext} /> : null}
        <Pressable
          style={{ flex: 1, height: 36, justifyContent: 'center' }}
          onLayout={(event: LayoutChangeEvent) => {
            trackWidth.current = event.nativeEvent.layout.width;
          }}
          onPress={handleTouch}
          onTouchMove={handleTouch}
        >
          <View style={{ height: 10, borderRadius: 5, backgroundColor: theme.border, overflow: 'hidden' }}>
            <View
              style={{
                width: `${((value - 1) / 9) * 100}%`,
                height: '100%',
                borderRadius: 5,
                backgroundColor: accent,
              }}
            />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: `${((value - 1) / 9) * 100}%`,
              marginLeft: -12,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: theme.card,
              borderWidth: 3,
              borderColor: accent,
              shadowColor: theme.shadow,
              shadowOpacity: 0.15,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          />
        </Pressable>
        {IconHigh ? <IconHigh size={22} color={theme.subtext} /> : null}
      </View>
    </View>
  );
}
