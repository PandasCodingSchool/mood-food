import type { ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fw } from '../constants/theme';

export default function Header({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        paddingTop: 60,
        paddingHorizontal: 24,
        paddingBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.bg,
      }}
    >
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.7}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={22} color={theme.text} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 40 }} />
      )}
      <Text
        style={[fw(900), { fontSize: 18, color: theme.text, flex: 1, textAlign: 'center' }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {right ? <View style={{ width: 40, alignItems: 'flex-end' }}>{right}</View> : <View style={{ width: 40 }} />}
    </View>
  );
}
