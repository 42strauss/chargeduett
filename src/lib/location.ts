import * as Location from 'expo-location';
import { DEMO } from './config';
import { DEMO_POSITION } from './demo/store';

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Aktuelle Position (nur Vordergrund-Berechtigung).
 * @param ask true = Berechtigung bei Bedarf anfragen, false = nur nutzen, wenn schon erteilt
 * @returns null, wenn keine Berechtigung
 */
export async function currentPosition(ask = false): Promise<LatLng | null> {
  if (DEMO) return DEMO_POSITION; // Demo: man steht immer an der Rastanlage Lindenhain
  let perm = await Location.getForegroundPermissionsAsync();
  if (!perm.granted && ask && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return null;
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}
