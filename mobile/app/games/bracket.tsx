import { useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import TwoCardDuel, { type DuelCard } from '../../src/components/games/TwoCardDuel';
import { SNACK_CARDS } from '../../src/constants/snackCards';
import { fw, colors } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { logSignal } from '../../src/services/signals';

const CAMPAIGN_KEY = 'summer_cravings_2026';

function toCard(item: (typeof SNACK_CARDS)[number]): DuelCard {
  return { id: item.name, label: item.name, emoji: item.emoji, colors: item.colors };
}

// 3.5 — Seasonal / event-driven mini-games. Bracket/tournament format:
// addictive, shareable, and a re-engagement hook via scarcity (limited-time).
export default function BracketScreen() {
  const router = useRouter();
  const [round, setRound] = useState<DuelCard[]>(SNACK_CARDS.map(toCard));
  const [nextRound, setNextRound] = useState<DuelCard[]>([]);
  const [matchIdx, setMatchIdx] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [champion, setChampion] = useState<DuelCard | null>(null);

  const a = round[matchIdx * 2];
  const b = round[matchIdx * 2 + 1];
  const roundLabel = round.length === 8 ? 'Round of 8' : round.length === 4 ? 'Semifinal' : 'Final';

  const handlePick = (winnerId: string) => {
    const winner = winnerId === a.id ? a : b;
    const updatedPicks = [...picks, winner.id];
    setPicks(updatedPicks);
    const updatedNext = [...nextRound, winner];

    if (matchIdx + 1 < round.length / 2) {
      setNextRound(updatedNext);
      setMatchIdx((i) => i + 1);
      return;
    }

    if (updatedNext.length === 1) {
      setChampion(updatedNext[0]);
      trackEvent('game_completed', { game: 'bracket', winner: updatedNext[0].label });
      void logSignal('bracket', { campaign_key: CAMPAIGN_KEY, picks: updatedPicks });
      return;
    }

    setRound(updatedNext);
    setNextRound([]);
    setMatchIdx(0);
  };

  const handleGetResults = () => {
    const results = {
      mood: 'happy',
      craving: 'comfort',
      budget: 'medium',
      preference: 'both',
      gameData: { type: 'bracket', champion: champion?.label },
    };
    router.push({ pathname: '/recommendations', params: { results: JSON.stringify(results) } });
  };

  return (
    <LinearGradient colors={['#fff7ed', '#ffffff']} style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 18, color: colors.navy }]}>☀️ Summer Cravings Bracket</Text>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {!champion ? (
          <>
            <Text style={[fw(800), { fontSize: 13, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }]}>
              {roundLabel}
            </Text>
            <TwoCardDuel prompt="Which one wins?" a={a} b={b} onPick={handlePick} />
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: 16 }}>
            <Text style={{ fontSize: 64 }}>{champion.emoji}</Text>
            <Text style={[fw(900), { fontSize: 22, color: colors.navy, textAlign: 'center' }]}>
              {champion.label} wins the bracket!
            </Text>
            <TouchableOpacity onPress={handleGetResults} activeOpacity={0.85} style={{ marginTop: 16, width: '100%' }}>
              <LinearGradient colors={['#f97316', '#fbbf24']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>🍽️ Show me my matches</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}
