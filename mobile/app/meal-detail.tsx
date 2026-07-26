import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, Animated, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Heart, ShoppingCart, Sparkles, Leaf, Wallet } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { fw, colors } from '../src/constants/theme';
import { dishIcon, dishGradient, resolveDishImage } from '../src/utils/dishVisuals';
import { bounceIn } from '../src/utils/animations';
import type { Recommendation } from '../src/types';

export default function MealDetailScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { rec: rawRec, rank: rawRank } = useLocalSearchParams<{ rec: string; rank: string }>();
  const [saved, setSaved] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const iconScale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => { bounceIn(iconScale); }, []);

  if (!rawRec) return null;
  const rec: Recommendation = JSON.parse(rawRec);
  const rank = Number(rawRank || 0);
  const heroGradient = dishGradient(rank);
  const Icon = dishIcon(rec);
  const imageUrl = !imageFailed ? resolveDishImage(rec) : null;
  const matchPct = rec.confidence != null ? `${Math.round(rec.confidence * 100)}% match` : null;

  const healthierSwap = rec.alternatives?.find((a) => a.type === 'healthier_swap');
  const budgetSwap = rec.alternatives?.find((a) => a.type === 'budget_swap');

  const liveMatch = rec.swiggy?.matched ? rec.swiggy : null;
  const liveRestaurantName = liveMatch?.item?.restaurant_name || liveMatch?.restaurant?.name;
  const liveEta = liveMatch?.item?.eta_min ?? liveMatch?.restaurant?.eta_min;
  const liveIsOpen = liveMatch?.restaurant?.is_open;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle="light-content" />
      <View style={{ height: 300 }}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <LinearGradient colors={heroGradient} style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ transform: [{ scale: iconScale }] }}>
              <Icon size={100} color="#fff" />
            </Animated.View>
          </LinearGradient>
        )}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ position: 'absolute', top: 60, left: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={22} color="#fff" />
        </TouchableOpacity>
        {matchPct && (
          <View style={{ position: 'absolute', top: 60, right: 20, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.2)' }}>
            <Text style={[fw(800), { fontSize: 13, color: '#fff' }]}>{matchPct}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={[fw(900), { fontSize: 24, color: theme.text }]}>{rec.dish.name}</Text>
            <Text style={[fw(600), { fontSize: 14, color: theme.subtext, marginTop: 4 }]}>
              {rec.dish.cuisine}{rec.dish.category ? ` · ${rec.dish.category}` : ''}
            </Text>
          </View>
          {rec.practical_details?.estimated_price != null && (
            <Text style={[fw(900), { fontSize: 22, color: colors.orange }]}>₹{rec.practical_details.estimated_price}</Text>
          )}
        </View>

        {liveRestaurantName && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: liveIsOpen === false ? theme.subtext : colors.green }} />
            <Text style={[fw(700), { fontSize: 12, color: theme.subtext }]} numberOfLines={1}>
              Live on Swiggy · {liveRestaurantName}{liveEta != null ? ` · ${liveEta} min` : ''}
            </Text>
          </View>
        )}

        {rec.dish.tags && rec.dish.tags.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {rec.dish.tags.map((tag) => (
              <View key={tag} style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, backgroundColor: colors.orange + '18' }}>
                <Text style={[fw(700), { fontSize: 12, color: colors.orange }]}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <LinearGradient colors={[theme.surface, theme.card]} style={{ marginTop: 24, padding: 16, borderRadius: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Sparkles size={16} color={colors.orange} />
            <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>Why this pick</Text>
          </View>
          <Text style={[fw(600), { fontSize: 13, color: theme.subtext, lineHeight: 20 }]}>
            {rec.ai_reasoning?.mood_match || 'This pick matches your current mood and cravings based on what you told us.'}
          </Text>
        </LinearGradient>

        {healthierSwap && (
          <View style={{ marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Leaf size={16} color={colors.green} />
              <Text style={[fw(800), { fontSize: 14, color: colors.green }]}>Healthier swap</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={[fw(700), { fontSize: 15, color: theme.text }]}>{healthierSwap.name}</Text>
                <Text style={[fw(600), { fontSize: 12, color: theme.subtext, marginTop: 2 }]}>{healthierSwap.reason}</Text>
              </View>
            </View>
          </View>
        )}

        {budgetSwap && (
          <View style={{ marginTop: 16, padding: 16, borderRadius: 16, backgroundColor: theme.surface, borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Wallet size={16} color={colors.blue} />
              <Text style={[fw(800), { fontSize: 14, color: colors.blue }]}>Budget pick</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={[fw(700), { fontSize: 15, color: theme.text }]}>{budgetSwap.name}</Text>
                <Text style={[fw(600), { fontSize: 12, color: theme.subtext, marginTop: 2 }]}>{budgetSwap.reason}</Text>
              </View>
            </View>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/order/app-select', params: { rec: rawRec, rank: rawRank } })}
            activeOpacity={0.85}
            style={{ flex: 1 }}
          >
            <View style={{ height: 52, borderRadius: 26, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
              <ShoppingCart size={18} color="#fff" />
              <Text style={[fw(800), { fontSize: 16, color: '#fff' }]}>Order now</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSaved((s) => !s)}
            style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <Heart size={22} color={saved ? colors.rose : theme.subtext} fill={saved ? colors.rose : 'transparent'} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
