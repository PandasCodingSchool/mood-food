import { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../../constants/theme';

export interface DuelCard {
  id: string;
  label: string;
  emoji: string;
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
      <Text style={[fw(800), { fontSize: 16, color: colors.navy, textAlign: 'center', marginBottom: 20 }]}>
        {prompt}
      </Text>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {[a, b].map((card, i) => {
          const scale = i === 0 ? scaleA : scaleB;
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
                  <Text style={{ fontSize: 56 }}>{card.emoji}</Text>
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
