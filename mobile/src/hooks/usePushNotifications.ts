import { useEffect } from 'react';
import { registerForPushNotificationsAsync } from '../services/pushNotifications';

export function usePushNotifications(): void {
  useEffect(() => {
    void registerForPushNotificationsAsync();
  }, []);
}
