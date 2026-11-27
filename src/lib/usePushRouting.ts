/**
 * Reagiert auf angetippte Benachrichtigungen:
 *  - Match/Nachricht → Chat öffnen
 *  - "Jemand Neues lädt hier" → Entdecken
 *  - Checkout-Erinnerung: Knopf "+30 Minuten" verlängert ohne App-Öffnen
 */
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { extendSession } from './api';
import { ACTION_EXTEND, PUSH_AVAILABLE } from './push';

export function usePushRouting(ready: boolean, onExtended: () => void) {
  const router = useRouter();
  useEffect(() => {
    if (!PUSH_AVAILABLE || !ready) return;
    const handle = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      const data = r.notification.request.content.data as { type?: string; match_id?: string };
      if (r.actionIdentifier === ACTION_EXTEND) {
        extendSession().then(onExtended).catch(() => undefined);
        return;
      }
      if ((data.type === 'match' || data.type === 'message') && data.match_id) {
        router.push({ pathname: '/chat/[matchId]', params: { matchId: data.match_id } });
      } else if (data.type === 'station') {
        router.navigate('/discover');
      } else if (data.type === 'checkout-reminder') {
        router.navigate('/');
      }
    };
    // App wurde über eine Benachrichtigung gestartet
    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [ready, router, onExtended]);
}
