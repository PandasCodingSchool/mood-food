import { useState, useRef, useEffect, useMemo, type ComponentType } from 'react';
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
  const [activeVariant, setActiveVariant] = useState<'original' | 'healthier_swap' | 'budget_swap'>('original');
  const iconScale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => { bounceIn(iconScale); }, []);
  useEffect(() => { setImageFailed(false); }, [activeVariant]);

  if (!rawRec) return null;
  const rec: Recommendation = JSON.parse(rawRec);
  const rank = Number(rawRank || 0);

  const currentRec = useMemo<Recommendation>(() => {
    if (activeVariant === 'original') return rec;
    const alt = rec.alternatives?.find((a) => a.type === activeVariant);
    if (!alt) return rec;
    return {
      ...rec,
      dish: {
        ...rec.dish,
        name: alt.name,
        cuisine: alt.cuisine ?? rec.dish.cuisine,
        category: alt.category ?? rec.dish.category,
        tags: alt.tags ?? rec.dish.tags,
      },
      image_url: alt.image_url ?? null,
      swiggy: null,
      practical_details: alt.practical_details
        ? { ...rec.practical_details, ...alt.practical_details }
        : rec.practical_details,
      ai_reasoning: { ...rec.ai_reasoning, mood_match: alt.reason },
    };
  }, [activeVariant, rec]);

  const heroGradient = dishGradient(rank);
  const Icon = dishIcon(currentRec);
  const imageUrl = !imageFailed ? resolveDishImage(currentRec) : null;
  const matchPct = currentRec.confidence != null ? `${Math.round(currentRec.confidence * 100)}% match` : null;

  const healthierSwap = rec.alternatives?.find((a) => a.type === 'healthier_swap');
  const budgetSwap = rec.alternatives?.find((a) => a.type === 'budget_swap');

  const activeReason =
    activeVariant === 'original'
      ? rec.ai_reasoning?.mood_match
      : rec.alternatives?.find((a) => a.type === activeVariant)?.reason;

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
            <Text style={[fw(900), { fontSize: 24, color: theme.text }]}>{currentRec.dish.name}</Text>
            <Text style={[fw(600), { fontSize: 14, color: theme.subtext, marginTop: 4 }]}>
              {currentRec.dish.cuisine}{currentRec.dish.category ? ` · ${currentRec.dish.category}` : ''}
            </Text>
          </View>
          {currentRec.practical_details?.estimated_price != null && (
            <Text style={[fw(900), { fontSize: 22, color: colors.orange }]}>₹{currentRec.practical_details.estimated_price}</Text>
          )}
        </View>

        {activeVariant === 'original' && liveRestaurantName && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: liveIsOpen === false ? theme.subtext : colors.green }} />
            <Text style={[fw(700), { fontSize: 12, color: theme.subtext }]} numberOfLines={1}>
              Live on Swiggy · {liveRestaurantName}{liveEta != null ? ` · ${liveEta} min` : ''}
            </Text>
          </View>
        )}

        {currentRec.dish.tags && currentRec.dish.tags.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {currentRec.dish.tags.map((tag) => (
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
            {activeReason || 'This pick matches your current mood and cravings based on what you told us.'}
          </Text>
        </LinearGradient>

        <View style={{ marginTop: 24, gap: 12 }}>
          <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>Choose your vibe</Text>
          <VariantCard
            icon={Sparkles}
            title="Original"
            subtitle={rec.dish.name}
            active={activeVariant === 'original'}
            accent={colors.orange}
            onPress={() => setActiveVariant('original')}
          />
          {healthierSwap && (
            <VariantCard
              icon={Leaf}
              title="Healthier swap"
              subtitle={healthierSwap.name}
              active={activeVariant === 'healthier_swap'}
              accent={colors.green}
              onPress={() => setActiveVariant('healthier_swap')}
            />
          )}
          {budgetSwap && (
            <VariantCard
              icon={Wallet}
              title="Budget pick"
              subtitle={budgetSwap.name}
              active={activeVariant === 'budget_swap'}
              accent={colors.blue}
              onPress={() => setActiveVariant('budget_swap')}
            />
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/order/app-select', params: { rec: JSON.stringify(currentRec), rank: rawRank } })}
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

function VariantCard({
  icon: Icon,
  title,
  subtitle,
  active,
  accent,
  onPress,
}: {
  icon: ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle: string;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        padding: 14,
        borderRadius: 14,
        backgroundColor: theme.surface,
        borderWidth: 2,
        borderColor: active ? accent : theme.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Icon size={20} color={accent} />
      <View style={{ flex: 1 }}>
        <Text style={[fw(800), { fontSize: 15, color: theme.text }]}>{title}</Text>
        <Text style={[fw(600), { fontSize: 12, color: theme.subtext }]} numberOfLines={1}>{subtitle}</Text>
      </View>
      {active && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accent }} />}
    </TouchableOpacity>
  );
}
