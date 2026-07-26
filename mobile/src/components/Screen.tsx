import { View, type ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ReactNode } from 'react';

export default function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { theme } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: theme.bg }, style]}>{children}</View>;
}
