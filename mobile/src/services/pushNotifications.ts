import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_BASE_URL, getHeaders } from './apiBase';

// Lazy-load expo-notifications because importing it eagerly in Expo Go
// crashes on SDK 53 (remote push notifications are unavailable there).
async function loadNotificationsModule() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
}

const PUSH_TOKEN_STORAGE_KEY = 'moodfood_push_token';

// Best-effort store of the last registered token so we avoid re-registering
// the same value on every app launch.
async function getLastRegisteredToken(): Promise<string | null> {
  // Using built-in async-storage dependency already present in the project.
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  try {
    return await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function setLastRegisteredToken(token: string | null): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  try {
    if (token) await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    else await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  } catch {
    // no-op
  }
}

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.expoConfig?.extra?.expo?.projectId ||
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  );
}

async function registerTokenOnServer(token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/user/notifications/register-push-token`, {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(`Push token registration failed: ${res.status}`);
  }
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (isExpoGo()) {
    console.log('Push token registration skipped in Expo Go');
    return null;
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    console.warn('expo-notifications not available');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f97316',
    });
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.warn('No Expo projectId found; cannot fetch push token.');
    return null;
  }

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!tokenResponse?.data) return null;
    const token = tokenResponse.data;

    const lastToken = await getLastRegisteredToken();
    if (token !== lastToken) {
      await registerTokenOnServer(token);
      await setLastRegisteredToken(token);
    }

    return token;
  } catch (err) {
    console.error('Failed to get Expo push token:', err);
    return null;
  }
}
