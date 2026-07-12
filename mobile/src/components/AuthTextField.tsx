import { View, Text, TextInput, type TextInputProps } from 'react-native';
import { fw, colors } from '../constants/theme';

type Props = TextInputProps & { label: string; error?: string };

export default function AuthTextField({ label, error, style, ...rest }: Props) {
  return (
    <View>
      <Text style={[fw(700), { fontSize: 13, color: colors.navy, marginBottom: 6 }]}>{label}</Text>
      <TextInput
        placeholderTextColor="#94a3b8"
        style={[
          fw(600),
          {
            borderWidth: 2,
            borderColor: error ? '#ef4444' : 'rgba(0,0,0,0.08)',
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 14,
            fontSize: 15,
            color: colors.navy,
            backgroundColor: '#fff',
          },
          style,
        ]}
        {...rest}
      />
      {error ? <Text style={[fw(600), { color: '#ef4444', fontSize: 12, marginTop: 6 }]}>{error}</Text> : null}
    </View>
  );
}
