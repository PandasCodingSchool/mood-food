import { glyphs } from '@moodfood/ui/src/glyphs';

/** Same Material Symbols subset the app ships (packages/ui/assets/fonts). */
export type IconName = keyof typeof glyphs;
export const glyph = (name: IconName) => String.fromCodePoint(glyphs[name]);
