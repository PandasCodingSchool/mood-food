// The "OO" eyes of the MoodFood wordmark, alive: quick saccades, blinks, lids
// and brows that act out expressions (curious, happy, surprised, sleepy,
// suspicious, hungry, eye-roll). Expression odds lean on the current mood; a tap
// startles them. Reduced motion keeps them still.
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { palette, type Mood } from '@moodfood/tokens';
import { useTheme } from '@moodfood/ui';
import { hapticSelect } from '../../utils/haptics';

const INK = palette.night;
const EYE = 25;
const RING = 4.5;
const INNER = EYE - RING * 2;
const PUPIL = 8;
/** How far the pupil centre may travel from the middle of the sclera. */
const REACH = (INNER - PUPIL) / 2;

interface Pose {
  x: number; // -1..1 of REACH
  y: number;
  lid: number; // 0 open → 1 closed
  lower: number; // 0 → 1 lower lid raised (smiling squint)
  browY: number; // px, negative = raised
  tilt: number; // deg; positive = inner ends down (cross)
  pupil: number; // pupil scale
  eye: number; // eyeball scale
}

const BASE: Pose = { x: 0, y: 0, lid: 0, lower: 0, browY: 0, tilt: 0, pupil: 1, eye: 1 };
const pose = (p: Partial<Pose>): Pose => ({ ...BASE, ...p });
const rand = (a: number, b: number) => a + Math.random() * (b - a);

type Expression = 'glance' | 'happy' | 'surprised' | 'sleepy' | 'suspicious' | 'hungry' | 'roll' | 'nervous';

const POSES: Record<Exclude<Expression, 'glance' | 'roll' | 'nervous'>, () => Pose> = {
  happy: () => pose({ y: 0.3, lid: 0.08, lower: 0.62, browY: -1.5, tilt: -6 }),
  surprised: () => pose({ pupil: 0.72, browY: -3.2, eye: 1.08 }),
  sleepy: () => pose({ y: 0.45, lid: 0.56, browY: 1, tilt: -9 }),
  suspicious: () => pose({ x: Math.random() < 0.5 ? -1 : 1, lid: 0.42, lower: 0.22, browY: 0.8, tilt: 11 }),
  hungry: () => pose({ x: -0.25, y: 0.95, pupil: 1.22, lower: 0.18, browY: -2, tilt: -5 }),
};

// Relative odds per mood; 'glance' (plain looking around) fills the gaps.
const ODDS: Record<Mood, Partial<Record<Expression, number>>> = {
  happy: { glance: 5, happy: 4, surprised: 1, roll: 1, hungry: 1, suspicious: 1 },
  hungry: { glance: 4, hungry: 5, happy: 2, surprised: 1, roll: 1 },
  tired: { glance: 3, sleepy: 6, roll: 1, happy: 1 },
  stressed: { glance: 2, nervous: 5, suspicious: 2, sleepy: 1, happy: 1 },
  adventurous: { glance: 4, surprised: 2, roll: 3, suspicious: 2, happy: 2 },
};

function pick(mood: Mood, last: Expression | null): Expression {
  const entries = Object.entries(ODDS[mood]).filter(([k]) => k !== last || k === 'glance') as [Expression, number][];
  let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
  for (const [k, w] of entries) if ((r -= w) <= 0) return k;
  return 'glance';
}

interface Values {
  x: SharedValue<number>;
  y: SharedValue<number>;
  lid: SharedValue<number>;
  lower: SharedValue<number>;
  browY: SharedValue<number>;
  tilt: SharedValue<number>;
  pupil: SharedValue<number>;
  eye: SharedValue<number>;
}

const SACCADE = { duration: 120, easing: Easing.out(Easing.cubic) };
const SOFT = { duration: 260, easing: Easing.inOut(Easing.quad) };

/** White pill with the two animated eyes (home / onboarding header). */
export function MoodEyes() {
  const { mood } = useTheme();
  const reduced = useReducedMotion();
  const v: Values = {
    x: useSharedValue(0),
    y: useSharedValue(0),
    lid: useSharedValue(0),
    lower: useSharedValue(0),
    browY: useSharedValue(0),
    tilt: useSharedValue(0),
    pupil: useSharedValue(1),
    eye: useSharedValue(1),
  };
  const baseLid = useRef(0);
  const moodRef = useRef(mood);
  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const later = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);

  const apply = useCallback(
    (p: Pose) => {
      v.x.value = withTiming(p.x * REACH, SACCADE);
      v.y.value = withTiming(p.y * REACH, SACCADE);
      v.lid.value = withTiming(p.lid, SOFT);
      v.lower.value = withTiming(p.lower, SOFT);
      v.browY.value = withTiming(p.browY, SOFT);
      v.tilt.value = withTiming(p.tilt, SOFT);
      v.pupil.value = withTiming(p.pupil, SOFT);
      v.eye.value = withSpring(p.eye, { damping: 9, stiffness: 220 });
      baseLid.current = p.lid;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const blink = useCallback(() => {
    const back = baseLid.current;
    const shut = () => withSequence(withTiming(1, { duration: 70 }), withTiming(back, { duration: 120 }));
    v.lid.value = Math.random() < 0.2 ? withSequence(shut(), withTiming(back, { duration: 90 }), shut()) : shut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Plays one expression, then schedules the next. */
  const play = useCallback(
    (last: Expression | null) => {
      const next = pick(moodRef.current, last);
      let hold = rand(1400, 2600);
      if (next === 'glance') {
        // A couple of quick looks around, like scanning the room.
        const looks = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < looks; i++) {
          later(() => apply(pose({ x: rand(-1, 1), y: rand(-0.8, 0.7) })), i * rand(450, 750));
        }
        hold = looks * 650 + rand(500, 1300);
      } else if (next === 'roll') {
        // Pupils travel a full circle (eyes up, round and back).
        apply(pose({ browY: -2.2 }));
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const a = -Math.PI / 2 + (i / steps) * Math.PI * 2;
          later(() => {
            v.x.value = withTiming(Math.cos(a) * REACH, { duration: 75, easing: Easing.linear });
            v.y.value = withTiming(Math.sin(a) * REACH, { duration: 75, easing: Easing.linear });
          }, 120 + i * 75);
        }
        later(() => apply(BASE), 120 + (steps + 2) * 75);
        hold = 2000;
      } else if (next === 'nervous') {
        // Fast darting with raised, worried brows.
        const darts = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < darts; i++) {
          later(() => apply(pose({ x: rand(-1, 1), y: rand(-0.6, 0.3), browY: -1.6, tilt: -10, lid: 0.05 })), i * rand(220, 340));
        }
        hold = darts * 300 + 700;
      } else {
        apply(POSES[next]());
        if (next === 'hungry') {
          // Eyes the food, then glances side to side.
          later(() => apply({ ...POSES.hungry(), x: 0.7 }), 900);
          later(() => apply({ ...POSES.hungry(), x: -0.7 }), 1500);
        }
        if (next === 'surprised') later(blink, 700);
      }
      // Most expressions relax back to neutral before the next one.
      if (next !== 'glance') later(() => apply(BASE), hold);
      later(() => play(next), hold + rand(500, 1400));
    },
    [apply, blink, later],
  );

  useEffect(() => {
    if (reduced) return;
    const t = timers.current;
    later(() => play(null), 600);
    const blinkLoop = () => {
      blink();
      later(blinkLoop, rand(2200, 5200));
    };
    later(blinkLoop, rand(1200, 2500));
    return () => {
      t.forEach(clearTimeout);
      t.clear();
    };
  }, [reduced, play, blink, later]);

  const startle = () => {
    if (reduced) return;
    void hapticSelect();
    apply(POSES.surprised());
    later(() => apply(POSES.happy()), 650);
    later(() => apply(BASE), 1700);
  };

  return (
    <Pressable
      onPress={startle}
      accessibilityRole="image"
      accessibilityLabel="MoodFood"
      style={{ width: 70, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 5, boxShadow: '0px 8px 18px -10px rgba(0,0,0,0.4)' }}
    >
      <Eye v={v} side="left" />
      <Eye v={v} side="right" />
    </Pressable>
  );
}

function Eye({ v, side }: { v: Values; side: 'left' | 'right' }) {
  const mirror = side === 'left' ? 1 : -1;
  const ball = useAnimatedStyle(() => ({ transform: [{ scale: v.eye.value }] }));
  const pupil = useAnimatedStyle(() => ({
    transform: [{ translateX: v.x.value }, { translateY: v.y.value }, { scale: v.pupil.value }],
  }));
  // Lids rest 2px outside the sclera so no anti-aliased edge peeks in.
  const upper = useAnimatedStyle(() => ({ transform: [{ translateY: -(INNER + 2) + v.lid.value * (INNER + 3) }] }));
  const lower = useAnimatedStyle(() => ({ transform: [{ translateY: INNER + 2 - v.lower.value * (INNER * 0.55 + 2) }] }));
  const brow = useAnimatedStyle(() => ({
    transform: [{ translateY: v.browY.value }, { rotate: `${v.tilt.value * mirror}deg` }],
  }));
  return (
    <View style={{ width: EYE, alignItems: 'center' }}>
      <Animated.View style={[{ position: 'absolute', top: -6, width: 11, height: 2.6, borderRadius: 2, backgroundColor: INK }, brow]} />
      <Animated.View
        style={[
          { width: EYE, height: EYE, borderRadius: EYE / 2, borderWidth: RING, borderColor: INK, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
          ball,
        ]}
      >
        <Animated.View style={[{ width: PUPIL, height: PUPIL, borderRadius: PUPIL / 2, backgroundColor: INK }, pupil]}>
          <View style={{ position: 'absolute', top: 1.4, left: 1.6, width: 2.6, height: 2.6, borderRadius: 1.3, backgroundColor: '#FFFFFF' }} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: INNER, backgroundColor: INK, borderBottomLeftRadius: INNER / 2, borderBottomRightRadius: INNER / 2 }, upper]} />
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: INNER, backgroundColor: INK, borderTopLeftRadius: INNER / 2, borderTopRightRadius: INNER / 2 }, lower]} />
      </Animated.View>
    </View>
  );
}
