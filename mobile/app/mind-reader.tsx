import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { fetchRecommendations } from '../src/services/aiRecommendations';
import { fw, colors } from '../src/constants/theme';
import { dishIcon, dishGradient, resolveDishImage } from '../src/utils/dishVisuals';
import LoadingScreen from '../src/components/LoadingScreen';
import { logSignal } from '../src/services/signals';
import { trackEvent } from '../src/utils/analytics';
import type { Recommendation } from '../src/types';

// 4.3 — Mind-reader mode: instead of options, the AI states "I think you
// want ___ tonight" with one confident pick + reasoning. Only reachable when
// confidence > 0.8 (gated server-side by the orchestrator's question_budget).
export default function MindReaderScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchRecommendations(
          { mood: 'happy', craving: 'comfort', budget: 'medium', preference: 'both' },
          { type: 'mind_reader' },
        );
        setRec(res.recommendations?.[0] || null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleVerdict = (accepted: boolean) => {
    setAnswered(true);
    void logSignal('mind_reader_verdict', { rec_id: rec?.id, dish_id: rec?.dish.id, accepted });
    trackEvent('mind_reader_verdict', { accepted });
    if (accepted && rec) {
      router.push({ pathname: '/meal-detail', params: { rec: JSON.stringify(rec), rank: '0' } });
    } else {
      router.push('/home');
    }
  };

  if (loading) return <LoadingScreen />;

  if (!rec) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg, padding: 24 }}>
        <Sparkles size={56} color={colors.purple} />
        <Text style={[fw(800), { fontSize: 18, color: theme.text, marginTop: 16, textAlign: 'center' }]}>
          Couldn't read your mind this time
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/home')}
          activeOpacity={0.85}
          style={{
            marginTop: 24,
            paddingVertical: 14,
            paddingHorizontal: 28,
            borderRadius: 24,
            backgroundColor: colors.orange,
          }}
        >
          <Text style={[fw(800), { color: '#fff', fontSize: 15 }]}>Back to games</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const imageUrl = !imageFailed ? resolveDishImage(rec) : null;

  return (
    <LinearGradient colors={['#1e1b4b', '#4338ca']} style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" />
      <View style={{ paddingTop: 70, paddingHorizontal: 24, alignItems: 'center' }}>
        <Sparkles size={36} color="#fff" />
        <Text style={[fw(900), { fontSize: 22, color: '#fff', textAlign: 'center', marginTop: 10 }]}>
          I think you want...
        </Text>
      </View>

      <View style={{ padding: 24, paddingTop: 28 }}>
        <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: theme.card }}>
          <View style={{ height: 180 }}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" onError={() => setImageFailed(true)} />
            ) : (
              <LinearGradient colors={dishGradient(0)} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                {(() => {
                  const Icon = dishIcon(rec);
                  return <Icon size={72} color="#fff" />;
                })()}
              </LinearGradient>
            )}
          </View>
          <View style={{ padding: 20 }}>
            <Text style={[fw(900), { fontSize: 22, color: theme.text }]}>{rec.dish.name}</Text>
            <Text style={[fw(600), { fontSize: 13, color: theme.subtext, marginTop: 4 }]}>{rec.dish.cuisine}</Text>
            {rec.ai_reasoning?.psychological_hook && (
              <Text style={[fw(600), { fontSize: 14, color: theme.subtext, marginTop: 14, lineHeight: 20, fontStyle: 'italic' }]}>
                "{rec.ai_reasoning.psychological_hook}"
              </Text>
            )}
          </View>
        </View>
      </View>

      {!answered && (
        <View style={{ paddingHorizontal: 24, gap: 12, marginTop: 12 }}>
          <TouchableOpacity onPress={() => handleVerdict(true)} activeOpacity={0.85}>
            <LinearGradient colors={['#22c55e', '#4ade80']} style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>Yes, exactly!</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleVerdict(false)}
            activeOpacity={0.85}
            style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' }}
          >
            <Text style={[fw(800), { fontSize: 16, color: '#fff' }]}>Not quite</Text>
          </TouchableOpacity>
        </View>
      )}
    </LinearGradient>
  );
}
