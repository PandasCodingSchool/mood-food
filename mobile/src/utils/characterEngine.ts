import { CHARACTERS, type CharacterProfile } from '../constants/characters';

/**
 * Matches the design's scorer exactly: each answer's option index maps to one archetype
 * (0=chill→Shaggy, 1=social→Jake, 2=adventurous→Leslie, 3=thoughtful→Monica).
 */
export function getCharacterMatch(answerIndices: number[]): CharacterProfile {
  const scores = [0, 0, 0, 0]; // jake, monica, leslie, shaggy
  answerIndices.forEach((a) => {
    if (a === 0) scores[3]++;
    if (a === 1) scores[0]++;
    if (a === 2) scores[2]++;
    if (a === 3) scores[1]++;
  });
  let maxIdx = 0;
  scores.forEach((s, i) => { if (s > scores[maxIdx]) maxIdx = i; });
  return CHARACTERS[maxIdx];
}
