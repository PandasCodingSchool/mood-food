import { DAY_MOODS, type DayMood } from '../constants/storyBeats';

/** Ports the design's exact scoring: each of the 5 scene answers nudges comfort/social/balanced/chaotic. */
export function getDayMood(answers: number[]): DayMood {
  let comfort = 0, social = 0, balanced = 0, chaotic = 0;
  answers.forEach((a, i) => {
    if (i === 0) {
      if (a === 0) { comfort++; chaotic++; }
      if (a === 1) { social++; balanced++; }
      if (a === 2) { chaotic++; comfort++; }
    } else if (i === 1) {
      if (a === 0) balanced += 2;
      if (a === 1) social++;
      if (a === 2) chaotic += 2;
    } else if (i === 2) {
      if (a === 0) social += 2;
      if (a === 1) comfort++;
      if (a === 2) chaotic += 2;
    } else if (i === 3) {
      if (a === 0) { chaotic++; comfort++; }
      if (a === 1) balanced += 2;
      if (a === 2) social++;
    } else if (i === 4) {
      if (a === 0) comfort += 2;
      if (a === 1) social += 2;
      if (a === 2) balanced += 2;
    }
  });
  const scores = [comfort, social, balanced, chaotic];
  let maxIdx = 0;
  scores.forEach((s, i) => { if (s > scores[maxIdx]) maxIdx = i; });
  return DAY_MOODS[maxIdx];
}
