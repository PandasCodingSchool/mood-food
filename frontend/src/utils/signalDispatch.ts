import type { GameResult, SwipeData } from "../types";
import { logSignal } from "../services/signals";

// Central dispatcher: every game's GameResult routes to the signals spine
// here, so adding a new game never means touching this file's callers —
// just teaching this one function how to read its gameData ("one model,
// many doors").
export function logGameCompletionSignal(results: GameResult): void {
  const gameData = results.gameData as
    | (GameResult["gameData"] & { raw?: Record<string, unknown> })
    | undefined;
  if (!gameData) return;

  if (gameData.type === "swipe_vibe") {
    const rawSwipes = (gameData.raw?.swipes as SwipeData[] | undefined) || [];
    if (rawSwipes.length > 0) {
      const swipes = rawSwipes.map((s, i) => ({
        item: s.item,
        liked: s.liked,
        reaction_time:
          i > 0 && s.timestamp && rawSwipes[i - 1]?.timestamp
            ? s.timestamp - rawSwipes[i - 1].timestamp
            : undefined,
      }));
      logSignal("swipe", { swipes });
    }
    return;
  }

  // Every other existing/future game: mine liked/disliked + swipes generically.
  logSignal("game_signals", {
    type: gameData.type,
    liked: gameData.liked || [],
    disliked: gameData.disliked || [],
    swipes: gameData.raw?.swipes || [],
  });
}
