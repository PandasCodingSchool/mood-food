import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { fw, colors } from '../constants/theme';
import { logSignal } from '../services/signals';

interface BlindBetStarsProps {
  dishId?: string;
  dishName?: string;
}

// 2.4 — Blind taste bet: predict your own rating before eating. Graded
// against the eventual post-meal score to measure self-knowledge
// calibration per cuisine (bridges taste and calibration).
export default function BlindBetStars({ dishId, dishName }: BlindBetStarsProps) {
  const [bet, setBet] = useState<number | null>(null);

  const handleBet = (score: number) => {
    setBet(score);
    void logSignal('blind_bet', { dish_id: dishId, dish_name: dishName, user_predicted_score: score });
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
      <Text style={[fw(700), { fontSize: 11, color: '#94a3b8' }]}>
        {bet ? 'Your bet:' : "How much will you like this?"}
      </Text>
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} onPress={() => handleBet(n)} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}>
            <Text style={{ fontSize: 14, color: bet != null && n <= bet ? colors.amber : '#e2e8f0' }}>★</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
