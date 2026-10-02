import { Animated, Easing } from 'react-native';

export function fadeUp(opacity: Animated.Value, translateY: Animated.Value, delay = 0) {
  translateY.setValue(20);
  opacity.setValue(0);
  Animated.parallel([
    Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
    Animated.timing(translateY, {
      toValue: 0,
      duration: 400,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  ]).start();
}

export function bounceIn(scale: Animated.Value, delay = 0) {
  scale.setValue(0.3);
  Animated.spring(scale, {
    toValue: 1,
    delay,
    friction: 5,
    tension: 60,
    useNativeDriver: true,
  }).start();
}

export function floatLoop(translateY: Animated.Value, distance = 8, duration = 1500) {
  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(translateY, {
        toValue: -distance,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
    ]),
  );
  loop.start();
  return loop;
}

export function pulseLoop(scale: Animated.Value, amount = 1.05, duration = 1000) {
  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(scale, { toValue: amount, duration, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration, useNativeDriver: true }),
    ]),
  );
  loop.start();
  return loop;
}

export function spinLoop(rotate: Animated.Value, duration = 1000) {
  rotate.setValue(0);
  const loop = Animated.loop(
    Animated.timing(rotate, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
  );
  loop.start();
  return loop;
}

export function pressScale(scale: Animated.Value, toValue: number) {
  Animated.spring(scale, { toValue, friction: 6, tension: 100, useNativeDriver: true }).start();
}
