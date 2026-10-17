import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router, type Href } from 'expo-router';
import { registerForPushNotificationsAsync } from '../services/pushNotifications';

// Where a tapped notification opens, by the `type` the API puts in its data.
const ROUTES: Record<string, Href> = {
  order_placed: '/order/track',
  quest_completed: '/quests',
  swiggy: '/swiggy-connect',
};

function openFor(data: Record<string, unknown> | undefined) {
  const route = ROUTES[String(data?.type ?? '')] ?? '/notifications';
  try {
    router.push(route);
  } catch {
    // navigator not mounted yet (cold start): the app opens on its own start screen
  }
}

export function usePushNotifications(): void {
  useEffect(() => {
    void registerForPushNotificationsAsync();
    if (Platform.OS === 'web') return;

    let sub: { remove(): void } | undefined;
    let alive = true;
    // Same lazy load as the service: importing expo-notifications eagerly crashes in Expo Go.
    import('expo-notifications')
      .then(async (N) => {
        if (!alive) return;
        // Without a handler, notifications that arrive while the app is open are dropped.
        N.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        sub = N.addNotificationResponseReceivedListener((r) => openFor(r.notification.request.content.data));
        // Tapped while the app was closed.
        const last = await N.getLastNotificationResponseAsync();
        if (alive && last) {
          await N.clearLastNotificationResponseAsync(); // or every launch reopens the same tap
          openFor(last.notification.request.content.data);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
}
