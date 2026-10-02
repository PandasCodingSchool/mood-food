import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'moodfood_last_nostalgia_prompt';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function shouldShowNostalgiaPrompt(): Promise<boolean> {
  try {
    const last = await AsyncStorage.getItem(KEY);
    if (!last) return true;
    return Date.now() - Number(last) > WEEK_MS;
  } catch {
    return false;
  }
}

export async function markNostalgiaPromptShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, String(Date.now()));
  } catch {
    // ignore
  }
}
