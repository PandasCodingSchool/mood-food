const KEY = "moodfood_last_nostalgia_prompt";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowNostalgiaPrompt(): boolean {
  try {
    const last = localStorage.getItem(KEY);
    if (!last) return true;
    return Date.now() - Number(last) > WEEK_MS;
  } catch {
    return false;
  }
}

export function markNostalgiaPromptShown(): void {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // ignore
  }
}
