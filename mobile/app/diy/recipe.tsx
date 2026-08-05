import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../../src/constants/theme';
import type { Recommendation } from '../../src/types';
import { generateRecipe } from '../../src/services/diy';
import GradientButton from '../../src/components/GradientButton';

export default function DiyRecipeScreen() {
  const router = useRouter();
  const { top: safeTop } = useSafeAreaInsets();
  const params = useLocalSearchParams<{ rec: string; rank?: string }>();
  const rec: Recommendation | null = params.rec ? JSON.parse(params.rec) : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!rec) return;
    setLoading(true);
    setError(null);
    const result = await generateRecipe(rec.dish.name, 2);
    setLoading(false);
    if (!result.success || !result.recipe) {
      setError(result.error || "Couldn't generate a recipe. Please try again.");
      return;
    }
    router.replace({
      pathname: '/diy/cart',
      params: { recipe: JSON.stringify(result.recipe), rank: params.rank || '0' },
    });
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rec) return null;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: safeTop + 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 18, color: colors.navy, flex: 1, textAlign: 'center', marginRight: 40 }]}>
          👨‍🍳 DIY it!
        </Text>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
        {loading ? (
          <>
            <LinearGradient colors={['#16a34a', '#4ade80']} style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 32 }}>🍳</Text>
            </LinearGradient>
            <ActivityIndicator color={colors.green} />
            <Text style={[fw(700), { fontSize: 14, color: '#64748b', textAlign: 'center' }]}>
              Whipping up a recipe for {rec.dish.name}…
            </Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 40 }}>😕</Text>
            <Text style={[fw(700), { fontSize: 14, color: '#64748b', textAlign: 'center' }]}>{error}</Text>
            <GradientButton label="Try again" colors={['#16a34a', '#4ade80']} onPress={() => void load()} style={{ marginTop: 8, width: 160 }} />
          </>
        )}
      </View>
    </View>
  );
}
