import { useRef } from 'react';
import { Animated, Pressable, Text, type ViewStyle, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { pressScale } from '../utils/animations';
import { fw } from '../constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  colors: readonly [string, string, ...string[]];
  disabled?: boolean;
  height?: number;
  fontSize?: number;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export default function GradientButton({
  label,
  onPress,
  colors,
  disabled,
  height = 56,
  fontSize = 18,
  style,
  textStyle,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: disabled ? 0.6 : 1 }, style]}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={() => pressScale(scale, 0.97)}
        onPressOut={() => pressScale(scale, 1)}
        disabled={disabled}
      >
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            height,
            borderRadius: height / 2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={[{ color: '#fff', fontSize }, fw(900), textStyle]}>{label}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
