import { useRef, type ReactNode } from 'react';
import { Animated, Pressable, Text, View, type ViewStyle, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { pressScale } from '../utils/animations';
import { colors as themeColors, fw } from '../constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  colors?: readonly [string, string, ...string[]];
  disabled?: boolean;
  height?: number;
  fontSize?: number;
  icon?: ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
};

export default function GradientButton({
  label,
  onPress,
  colors = [themeColors.orange, themeColors.orange],
  disabled,
  height = 56,
  fontSize = 17,
  icon,
  style,
  textStyle,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const radius = height / 2;

  return (
    <Animated.View
      style={[
        {
          transform: [{ scale }],
          opacity: disabled ? 0.5 : 1,
          borderRadius: radius,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 5,
        },
        style,
      ]}
    >
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
            borderRadius: radius,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: icon ? 24 : 0,
          }}
        >
          {icon ? <View>{icon}</View> : null}
          <Text style={[{ color: '#fff', fontSize, letterSpacing: 0.3 }, fw(800), textStyle]}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
