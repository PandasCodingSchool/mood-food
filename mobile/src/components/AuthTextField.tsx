import { useTheme } from '../context/ThemeContext';
import type { ReactNode } from 'react';
import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { fw } from '../constants/theme';

type Props = TextInputProps & { label: string; error?: string; icon?: ReactNode };

export default function AuthTextField({ label, error, icon, style, ...rest }: Props) {
  const { theme } = useTheme();
  return (
    <View>
      <Text style={[fw(700), { fontSize: 13, color: theme.text, marginBottom: 6 }]}>{label}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 2,
          borderColor: error ? '#ef4444' : theme.border,
          borderRadius: 16,
          paddingHorizontal: icon ? 12 : 16,
          backgroundColor: theme.input,
        }}
      >
        {icon ? <View style={{ marginRight: 10 }}>{icon}</View> : null}
        <TextInput
          placeholderTextColor={theme.muted}
          style={[
            fw(600),
            {
              flex: 1,
              paddingVertical: 14,
              fontSize: 15,
              color: theme.text,
            },
            style,
          ]}
          {...rest}
        />
      </View>
      {error ? <Text style={[fw(600), { color: '#ef4444', fontSize: 12, marginTop: 6 }]}>{error}</Text> : null}
    </View>
  );
}
