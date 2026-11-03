/**
 * KitchenCircle brand — Direction A “Fresh & independent” (KitchenCircle Brand Kit).
 *
 * Colour from the Indian kitchen. Rough ratio: 70% chawal and white, 20% kadhai ink, 10% curry leaf,
 * with haldi for one highlight per screen (text on haldi is always kadhai ink). Mirchi is only for
 * hard-constraint warnings and always comes with a word. Display: Bricolage Grotesque 700–800;
 * body: Figtree 400–700. Built from circles; cards 16–24px radius, 1px steel border, no shadows —
 * with a light glass finish on the chawal ground.
 */
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
} from '@expo-google-fonts/figtree';
import type { Theme } from '@moodfood/tokens';

export const kc = {
  curryLeaf: '#2F6B4F', // primary, actions, the ring
  curryLeafDeep: '#1F4A36', // text on leaf tint
  haldi: '#E8A317', // today, highlights, the katoris
  haldiDeep: '#6B4A00', // text on haldi tint
  kadhai: '#1C2620', // ink
  steel: '#D9DEDC', // lines
  chawal: '#F7F3EA', // ground
  raised: '#FFFFFF', // cards
  leafTint: '#DDEBE2',
  haldiTint: '#FBEBC7',
  mutedInk: '#56625B', // 5.6:1 on chawal
  dashed: '#8A948E', // blank-day ring
  mirchi: '#A3291B', // allergy & errors only
  mirchiTint: '#F9E1DC',
  sand: '#EFEAE0',
} as const;

export const KC_TAGLINE = 'One meal. Everyone in.';

/** Figtree replaces the MoodFood body face inside KitchenCircle; Bricolage display stays shared. */
export const kcFonts = { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold, Figtree_800ExtraBold };

const FONT_MAP: Record<string, string> = {
  Geist_400Regular: 'Figtree_400Regular',
  Geist_500Medium: 'Figtree_500Medium',
  Geist_600SemiBold: 'Figtree_600SemiBold',
  Geist_700Bold: 'Figtree_700Bold',
};

/** KitchenCircle is always on the light chawal ground, whatever the MoodFood time/weather theme is. */
export function kitchenCircleTheme(base: Theme): Theme {
  return {
    ...base,
    dark: false,
    colors: {
      ink: kc.kadhai,
      ink2: kc.mutedInk,
      surf: 'rgba(255,255,255,0.72)', // glass on chawal
      surf2: 'rgba(255,255,255,0.88)',
      line: kc.steel,
      track: '#E6E9E7',
      tint: kc.leafTint,
      solid: kc.raised,
      tab: 'rgba(247,243,234,0.88)',
      ph1: kc.sand,
      ph2: '#E6E0D2',
      acc: kc.curryLeaf,
      acc2: '#3D8462',
      accSoft: kc.leafTint,
      accText: kc.curryLeaf,
      onAcc: kc.chawal,
    },
    backdrop: {
      gradient: { angle: 170, colors: [kc.chawal, '#F3EEE2', kc.chawal], locations: [0, 0.55, 1] },
      overlay: null,
      orbs: [kc.haldiTint, kc.leafTint],
      orbOpacity: 0.55,
    },
    fonts: FONT_MAP,
  };
}
