import { useRef } from 'react';
import type { ComponentType } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { fw } from '../../constants/theme';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

export interface DuelCard {
  id: string;
  label: string;
  Icon: LucideIcon;
  colors: readonly [string, string];
}

interface TwoCardDuelProps {
  prompt: string;
  a: DuelCard;
  b: DuelCard;
  onPick: (winnerId: string) => void;
}

// Forced binary choice card pair — used by This-or-That (3.1) and seasonal
// brackets (3.5). Pairwise picks feed Bradley-Terry trade-off learning.
export default function TwoCardDuel({ prompt, a, b, onPick }: TwoCardDuelProps) {
  const { theme } = useTheme();
  const scaleA = useRef(new Animated.Value(1)).current;
  const scaleB = useRef(new Animated.Value(1)).current;

  const press = (scale: Animated.Value, id: string) => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start(() => onPick(id));
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[fw(800), { fontSize: 16, color: theme.text, textAlign: 'center', marginBottom: 20 }]}>
        {prompt}
      </Text>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {[a, b].map((card, i) => {
          const scale = i === 0 ? scaleA : scaleB;
          const CardIcon = card.Icon;
          return (
            <Animated.View key={card.id} style={{ transform: [{ scale }] }}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => press(scale, card.id)}>
                <LinearGradient
                  colors={card.colors}
                  style={{
                    width: 150,
                    height: 190,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                  }}
                >
                  <CardIcon size={56} color="#fff" />
                  <Text style={[fw(900), { fontSize: 16, color: '#fff', textAlign: 'center', marginTop: 10 }]}>
                    {card.label}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}
