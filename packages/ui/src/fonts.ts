import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { fontFamily } from '@moodfood/tokens';

/** Pass to expo-font's `useFonts` once at the app root. */
export const moodfoodFonts = {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  GeistMono_400Regular,
  GeistMono_500Medium,
  [fontFamily.iconOutlined]: require('../assets/fonts/MaterialSymbolsRounded-Outlined.ttf'),
  [fontFamily.iconFilled]: require('../assets/fonts/MaterialSymbolsRounded-Filled.ttf'),
};
