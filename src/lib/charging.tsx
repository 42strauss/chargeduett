/**
 * Hält die aktive Ladesession app-weit und schickt im Vordergrund alle
 * 3 Minuten einen Heartbeat, damit Wegfahren erkannt wird.
 * Bewusst KEIN Hintergrund-Standort: weniger Akku, weniger Datenschutzrisiko,
 * und App-Store-Prüfungen sind deutlich einfacher. Der Server beendet
 * Sessions zusätzlich nach 60 Minuten automatisch.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { Alert } from '@/lib/dialog';
import * as api from './api';
import { useAuth } from './auth';
import { t } from './i18n';
import { currentPosition } from './location';
import { cancelCheckoutReminder, scheduleCheckoutReminder } from './push';
import type { ActiveSession } from './types';

const HEARTBEAT_MS = 3 * 60 * 1000;

interface ChargingState {
  session: ActiveSession | null;
  refresh: () => Promise<void>;
  checkIn: (vehicleId?: string | null, stationId?: number | null) => Promise<void>;
  checkOut: () => Promise<void>;
  extend: () => Promise<void>;
}

const Ctx = createContext<ChargingState | null>(null);

export function ChargingProvider({ children }: { children: ReactNode }) {
  const { session: auth, profile } = useAuth();
  const [session, setSession] = useState<ActiveSession | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!auth || !profile) return setSession(null);
    try {
      setSession(await api.myActiveSession());
    } catch {
      /* offline – alten Stand behalten */
    }
  }, [auth, profile]);

  const beat = useCallback(async () => {
    if (!session) return;
    try {
      const pos = await currentPosition();
      if (!pos) return;
      const res = await api.heartbeat(pos.lat, pos.lng);
      if (!res.active) {
        setSession(null);
        if (res.reason === 'moved_away') Alert.alert(t('charge.title'), t('charge.movedAway'));
      } else {
        await refresh();
      }
    } catch {
      /* ignorieren, nächster Versuch folgt */
    }
  }, [session, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Lokale Erinnerung 5 Min. vor dem Auto-Checkout immer am aktuellen Ablaufzeitpunkt ausrichten
  useEffect(() => {
    if (session) scheduleCheckoutReminder(session.expires_at, session.station_name).catch(() => undefined);
    else cancelCheckoutReminder().catch(() => undefined);
  }, [session?.session_id, session?.expires_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Heartbeat nur bei aktiver Session und App im Vordergrund
  useEffect(() => {
    const start = () => {
      if (timer.current || !session) return;
      timer.current = setInterval(beat, HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
    if (session && AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        refresh();
        start();
      } else stop();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [session, beat, refresh]);

  // Lokaler Ablauf: wenn expires_at erreicht, Session clientseitig entfernen
  useEffect(() => {
    if (!session) return;
    const ms = new Date(session.expires_at).getTime() - Date.now();
    const id = setTimeout(refresh, Math.max(ms + 2000, 1000));
    return () => clearTimeout(id);
  }, [session, refresh]);

  const checkIn = useCallback(
    async (vehicleId?: string | null, stationId?: number | null) => {
      const pos = await currentPosition(true);
      if (!pos) throw new Error('LOCATION_DENIED');
      await api.checkIn(pos.lat, pos.lng, vehicleId, stationId);
      await refresh();
    },
    [refresh],
  );

  const checkOut = useCallback(async () => {
    await api.checkOut();
    setSession(null);
  }, []);

  const extend = useCallback(async () => {
    await api.extendSession();
    await refresh();
  }, [refresh]);

  const value = useMemo(() => ({ session, refresh, checkIn, checkOut, extend }), [session, refresh, checkIn, checkOut, extend]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCharging(): ChargingState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCharging außerhalb von ChargingProvider');
  return v;
}
