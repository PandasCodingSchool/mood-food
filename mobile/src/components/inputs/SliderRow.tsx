import { useRef } from 'react';
import { View, Text, Pressable, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { fw, colors } from '../../constants/theme';

interface SliderRowProps {
  label: string;
  emojiLow: string;
  emojiHigh: string;
  value: number; // 1-10
  onChange: (value: number) => void;
  accent?: string;
}

// Emoji-labelled 1-10 slider built as a tappable/draggable segment track
// (no external slider dependency).
export default function SliderRow({
  label,
  emojiLow,
  emojiHigh,
  value,
  onChange,
  accent = '#f97316',
}: SliderRowProps) {
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
        <Text style={[fw(800), { fontSize: 15, color: colors.navy }]}>{label}</Text>
        <Text style={[fw(900), { fontSize: 15, color: accent }]}>{value}/10</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 22 }}>{emojiLow}</Text>
        <Pressable
          style={{ flex: 1, height: 36, justifyContent: 'center' }}
          onLayout={(event: LayoutChangeEvent) => {
            trackWidth.current = event.nativeEvent.layout.width;
          }}
          onPress={handleTouch}
          onTouchMove={handleTouch}
        >
          <View style={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
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
              backgroundColor: '#fff',
              borderWidth: 3,
              borderColor: accent,
              shadowColor: '#000',
              shadowOpacity: 0.15,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          />
        </Pressable>
        <Text style={{ fontSize: 22 }}>{emojiHigh}</Text>
      </View>
    </View>
  );
}
