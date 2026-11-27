import { Alert } from '@/lib/dialog';
import { t } from './i18n';

const KNOWN = [
  'NOT_AUTHENTICATED',
  'PROFILE_MISSING',
  'BANNED',
  'UNDERAGE',
  'BIRTHDATE_LOCKED',
  'NO_STATION_NEARBY',
  'LOCATION_CONSENT_MISSING',
  'NO_ACTIVE_SESSION',
  'TARGET_NOT_AVAILABLE',
  'VEHICLE_NOT_OWNED',
  'VEHICLE_NOT_FOUND',
] as const;
export type ErrorCode = (typeof KNOWN)[number] | 'network' | 'unknown';

/** Wandelt Supabase-/Netzwerkfehler in einen bekannten Code um. */
export function errorCode(e: unknown): ErrorCode {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  const hit = KNOWN.find((k) => msg.includes(k));
  if (hit) return hit;
  if (/network|fetch failed|Failed to fetch/i.test(msg)) return 'network';
  return 'unknown';
}

export function errorText(e: unknown): string {
  return t(`errors.${errorCode(e)}`);
}

export function showError(e: unknown) {
  if (__DEV__) console.warn(e);
  // Nicht angemeldet: Das Root-Layout leitet ohnehin zum Login weiter – kein Fehlerdialog
  if (errorCode(e) === 'NOT_AUTHENTICATED') return;
  Alert.alert(t('common.error'), errorText(e));
}

/** Wirft den Supabase-Fehler, sonst gibt die Daten zurück. */
export function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}
