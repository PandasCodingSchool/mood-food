import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Home, List, Zap } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { colors, fw } from '../constants/theme';
import { logSignal } from '../services/signals';

type Tab = 'games' | 'history' | 'results' | 'profile';

const TABS: { key: Tab; icon: typeof Home; label: string; route: '/home' | '/history' }[] = [
  { key: 'games', icon: Home, label: 'Games', route: '/home' },
  { key: 'history', icon: List, label: 'History', route: '/history' },
];

export default function BottomNav({ active }: { active: Tab }) {
  const router = useRouter();
  const { theme } = useTheme();

  const handleSos = () => {
    void logSignal('sos', {});
    router.push('/mind-reader');
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
        justifyContent: 'space-between',
        paddingHorizontal: 48,
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

      <TouchableOpacity
        onPress={handleSos}
        activeOpacity={0.85}
        style={{
          position: 'absolute',
          top: -22,
          left: '60%',
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
