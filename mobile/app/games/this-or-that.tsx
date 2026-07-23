import { useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import TwoCardDuel from '../../src/components/games/TwoCardDuel';
import { DUEL_ROUNDS } from '../../src/constants/duels';
import { fw, colors } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { logSignal } from '../../src/services/signals';

// 3.1 — This or That: forced binary duels that reveal trade-off weights
// (price vs. health vs. speed vs. adventure vs. comfort) users can't
// articulate when asked directly. Feeds Bradley-Terry learning.
export default function ThisOrThatScreen() {
  const router = useRouter();
  const [round, setRound] = useState(0);
  const [duels, setDuels] = useState<Array<{ dimensionA: string; dimensionB: string; winner: string }>>([]);

  const current = DUEL_ROUNDS[round];
  const done = round >= DUEL_ROUNDS.length;

  const handlePick = (winnerId: string) => {
    const winnerDimension = winnerId === current.a.id ? current.dimensionA : current.dimensionB;
    const nextDuels = [
      ...duels,
      { dimensionA: current.dimensionA, dimensionB: current.dimensionB, winner: winnerDimension },
    ];
    setDuels(nextDuels);

    if (round + 1 >= DUEL_ROUNDS.length) {
      void logSignal('this_or_that', {
        duels: nextDuels.map((d) => ({
          dimension_a: d.dimensionA,
          dimension_b: d.dimensionB,
          winner: d.winner,
        })),
      });
      trackEvent('game_completed', { game: 'this_or_that', duels: nextDuels });
    }
    setRound((r) => r + 1);
  };

  const handleGetResults = () => {
    const results = {
      mood: 'happy',
      craving: 'comfort',
      budget: 'medium',
      preference: 'both',
      gameData: { type: 'this_or_that', duelResults: duels },
    };
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  return (
    <LinearGradient colors={['#eef2ff', '#ffffff']} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, height: 6, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
          <LinearGradient
            colors={['#4338ca', '#818cf8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: '100%', width: `${(Math.min(round, DUEL_ROUNDS.length) / DUEL_ROUNDS.length) * 100}%`, borderRadius: 3 }}
          />
        </View>
        <Text style={[fw(800), { fontSize: 13, color: '#94a3b8' }]}>
          {Math.min(round + 1, DUEL_ROUNDS.length)}/{DUEL_ROUNDS.length}
        </Text>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {!done ? (
          <TwoCardDuel prompt={current.prompt} a={current.a} b={current.b} onPick={handlePick} />
        ) : (
          <View style={{ alignItems: 'center', gap: 16 }}>
            <Text style={{ fontSize: 64 }}>⚔️</Text>
            <Text style={[fw(900), { fontSize: 22, color: colors.navy, textAlign: 'center' }]}>
              Trade-offs learned!
            </Text>
            <Text style={[fw(600), { fontSize: 14, color: '#64748b', textAlign: 'center', maxWidth: 260, lineHeight: 20 }]}>
              Now we know what you actually care about when it counts.
            </Text>
            <TouchableOpacity onPress={handleGetResults} activeOpacity={0.85} style={{ marginTop: 16, width: '100%' }}>
              <LinearGradient colors={['#4338ca', '#818cf8']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>🍽️ Show me my matches</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}
