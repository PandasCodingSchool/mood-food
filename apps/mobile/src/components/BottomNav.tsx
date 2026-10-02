import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Home, List, Target, User, Zap, Sparkles } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, fw } from '../constants/theme';
import { getLastRecommendation, getSavedAddressId } from '../services/aiRecommendations';
import { logSignal } from '../services/signals';

type Tab = 'games' | 'history' | 'results' | 'quests' | 'profile';

const TABS: { key: Tab; icon: typeof Home; label: string; route: '/home' | '/history' | '/quests' | '/profile' }[] = [
  { key: 'games', icon: Home, label: 'Games', route: '/home' },
  { key: 'history', icon: List, label: 'History', route: '/history' },
  { key: 'quests', icon: Target, label: 'Quests', route: '/quests' },
  { key: 'profile', icon: User, label: 'Profile', route: '/profile' },
];

export default function BottomNav({ active }: { active: Tab }) {
  const router = useRouter();
  const { theme } = useTheme();

  const handleSos = () => {
    void logSignal('sos', {});
    router.push('/mind-reader');
  };

  const handleAskCaptain = async () => {
    const rec = await getLastRecommendation();
    if (!rec) {
      router.push('/mind-reader');
      return;
    }
    const restaurantId = rec.swiggy?.item?.restaurant_id ?? rec.swiggy?.restaurant?.id;
    if (!restaurantId) {
      router.push('/mind-reader');
      return;
    }
    const addressId = await getSavedAddressId();
    if (!addressId) {
      router.push('/mind-reader');
      return;
    }
    router.push({
      pathname: '/restaurant-menu',
      params: {
        restaurantId,
        addressId,
        restaurantName: rec.swiggy?.item?.restaurant_name || rec.swiggy?.restaurant?.name || '',
        dishId: rec.dish.id || '',
        dishName: rec.dish.name,
        why: rec.ai_reasoning?.mood_match || '',
        initialMenuItemId: rec.swiggy?.item?.id || '',
      },
    });
  };

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 90,
        backgroundColor: theme.navBg,
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-around',
        paddingHorizontal: 0,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: theme.border,
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active || (tab.key === 'history' && active === 'results');
        const label = tab.key === 'history' && active === 'results' ? 'Results' : tab.label;
        const Icon = tab.icon;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.7}
            onPress={() => !isActive && router.push(tab.route)}
            style={{ alignItems: 'center', gap: 4, opacity: isActive ? 1 : 0.45 }}
          >
            <Icon size={24} color={isActive ? colors.orange : theme.subtext} />
            <Text
              style={[
                fw(isActive ? 800 : 700),
                { fontSize: 10, color: isActive ? colors.orange : theme.subtext },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}

      {active === 'games' && (
        <TouchableOpacity
          onPress={handleAskCaptain}
          activeOpacity={0.85}
          style={{
            position: 'absolute',
            top: -72,
            right: 20,
            height: 44,
            borderRadius: 22,
            paddingHorizontal: 16,
            backgroundColor: colors.purple,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          <Sparkles size={18} color="#fff" />
          <Text style={[fw(800), { fontSize: 13, color: '#fff' }]}>Ask Captain</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={handleSos}
        activeOpacity={0.85}
        style={{
          position: 'absolute',
          top: -136,
          right: 20,
          marginLeft: 0,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.orange,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Zap size={26} color="#fff" fill="#fff" />
      </TouchableOpacity>
    </View>
  );
}
