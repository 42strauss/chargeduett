/**
 * Push-Benachrichtigungen (expo-notifications).
 *
 * - Erlaubnis wird NICHT beim Start abgefragt, sondern beim ersten Match
 *   (höhere Zustimmung auf iOS, und der Nutzer versteht, wofür).
 * - Server-Pushes (Match, Nachricht, "Jemand Neues lädt hier") kommen vom
 *   Expo-Push-Dienst, ausgelöst durch Datenbank-Trigger (Migration *_push.sql).
 * - Die Erinnerung 5 Min. vor dem Auto-Checkout wird LOKAL geplant – mit
 *   Aktionsknopf "+30 Minuten".
 * - Im Web/Demo-Modus sind alle Funktionen No-ops.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { registerPushToken } from './api';
import { DEMO } from './config';
import { t } from './i18n';

const ENABLED = Platform.OS !== 'web' && !DEMO;
export const CHECKOUT_CATEGORY = 'checkout-reminder';
export const ACTION_EXTEND = 'extend-30';
const REMINDER_ID = 'checkout-reminder';

if (ENABLED) {
  // Im Vordergrund: Banner zeigen, außer für den gerade offenen Chat (regelt der Chat selbst über markRead)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

let categoryReady = false;
async function ensureSetup() {
  if (!ENABLED || categoryReady) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Charge Duett',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  await Notifications.setNotificationCategoryAsync(CHECKOUT_CATEGORY, [
    { identifier: ACTION_EXTEND, buttonTitle: t('charge.extend'), options: { opensAppToForeground: false } },
  ]);
  categoryReady = true;
}

/** Fragt (falls nötig) die Erlaubnis an und registriert das Gerät. Gibt zurück, ob Pushes erlaubt sind. */
export async function enablePush(ask: boolean): Promise<boolean> {
  if (!ENABLED || !Device.isDevice) return false;
  await ensureSetup();
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return false;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    if (__DEV__) console.warn('Push: EAS projectId fehlt (eas init ausführen)');
    return false;
  }
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await registerPushToken(data, Platform.OS === 'ios' ? 'ios' : 'android');
    return true;
  } catch (e) {
    if (__DEV__) console.warn('Push-Registrierung fehlgeschlagen', e);
    return false;
  }
}

/** Plant die lokale Erinnerung 5 Minuten vor dem automatischen Auschecken (ersetzt eine vorhandene). */
export async function scheduleCheckoutReminder(expiresAt: string, stationName: string) {
  if (!ENABLED) return;
  await cancelCheckoutReminder();
  const when = new Date(new Date(expiresAt).getTime() - 5 * 60000);
  if (when.getTime() <= Date.now() + 5000) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await ensureSetup();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: t('push.reminderTitle'),
      body: t('push.reminderBody', { station: stationName }),
      categoryIdentifier: CHECKOUT_CATEGORY,
      data: { type: 'checkout-reminder' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
}

export async function cancelCheckoutReminder() {
  if (!ENABLED) return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
}

export { ENABLED as PUSH_AVAILABLE };
