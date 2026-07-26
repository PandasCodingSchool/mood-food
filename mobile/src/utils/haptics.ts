import * as Haptics from 'expo-haptics';

let hapticsEnabled = true;

export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled;
}

export async function hapticSelect() {
  if (!hapticsEnabled) return;
  try {
    await Haptics.selectionAsync();
  } catch {
    // ignore unsupported devices
  }
}

export async function hapticSuccess() {
  if (!hapticsEnabled) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // ignore
  }
}

export async function hapticImpact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) {
  if (!hapticsEnabled) return;
  try {
    await Haptics.impactAsync(style);
  } catch {
    // ignore
  }
}

export async function hapticWarning() {
  if (!hapticsEnabled) return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // ignore
  }
}
