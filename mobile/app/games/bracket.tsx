import { useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Sun, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';
import TwoCardDuel, { type DuelCard } from '../../src/components/games/TwoCardDuel';
import { SNACK_CARDS } from '../../src/constants/snackCards';
import { fw, colors } from '../../src/constants/theme';
import { trackEvent } from '../../src/utils/analytics';
import { logSignal } from '../../src/services/signals';

const CAMPAIGN_KEY = 'summer_cravings_2026';

function toCard(item: (typeof SNACK_CARDS)[number]): DuelCard {
  return { id: item.name, label: item.name, Icon: item.Icon, colors: item.colors };
}

// 3.5 — Seasonal / event-driven mini-games. Bracket/tournament format:
// addictive, shareable, and a re-engagement hook via scarcity (limited-time).
export default function BracketScreen() {
  const router = useRouter();
  const { theme } = useTheme();
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
    <LinearGradient colors={[theme.bg, theme.surface]} style={{ flex: 1 }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Sun size={22} color={colors.orange} />
          <Text style={[fw(900), { fontSize: 18, color: theme.text }]}>Summer Cravings Bracket</Text>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {!champion ? (
          <>
            <Text style={[fw(800), { fontSize: 13, color: theme.subtext, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }]}>
              {roundLabel}
            </Text>
            <TwoCardDuel prompt="Which one wins?" a={a} b={b} onPick={handlePick} />
          </>
        ) : (
          <View style={{ alignItems: 'center', gap: 16 }}>
            {(() => {
              const ChampionIcon = champion.Icon;
              return <ChampionIcon size={64} color={colors.orange} />;
            })()}
            <Text style={[fw(900), { fontSize: 22, color: theme.text, textAlign: 'center' }]}>
              {champion.label} wins the bracket!
            </Text>
            <TouchableOpacity onPress={handleGetResults} activeOpacity={0.85} style={{ marginTop: 16, width: '100%' }}>
              <LinearGradient colors={['#f97316', '#fbbf24']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
                <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>Show me my matches</Text>
                <ArrowRight size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </LinearGradient>
  );
}
