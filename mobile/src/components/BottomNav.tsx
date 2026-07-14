import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fw } from '../constants/theme';

type Tab = 'games' | 'history' | 'results' | 'profile';

const TABS: { key: Tab; icon: string; label: string; route: '/home' | '/history' | '/profile' }[] = [
  { key: 'games', icon: '🎮', label: 'Games', route: '/home' },
  { key: 'history', icon: '📋', label: 'History', route: '/history' },
  { key: 'profile', icon: '👤', label: 'Profile', route: '/profile' },
];

export default function BottomNav({ active }: { active: Tab }) {
  const router = useRouter();

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 90,
        backgroundColor: 'rgba(255,245,235,0.97)',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-around',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
      }}
    >
      {TABS.map((tab) => {
        // "results" contextually relabels the History tab when reached via gameplay, matching the design.
        const isActive = tab.key === active || (tab.key === 'history' && active === 'results');
        const label = tab.key === 'history' && active === 'results' ? 'Results' : tab.label;
        return (
          <TouchableOpacity
            key={tab.key}
            activeOpacity={0.7}
            onPress={() => !isActive && router.push(tab.route)}
            style={{ alignItems: 'center', gap: 4, opacity: isActive ? 1 : 0.4 }}
          >
            <Text style={{ fontSize: 24 }}>{tab.icon}</Text>
            <Text
              style={[
                fw(isActive ? 800 : 700),
                { fontSize: 10, color: isActive ? colors.orange : colors.navy },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
