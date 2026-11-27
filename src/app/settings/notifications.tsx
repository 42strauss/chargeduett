import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { Button, Card, P, Screen, ToggleRow } from '@/components/ui';
import { getNotificationSettings, saveNotificationSettings } from '@/lib/api';
import { showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { enablePush, PUSH_AVAILABLE } from '@/lib/push';
import type { NotificationSettings } from '@/lib/types';

export default function NotificationsScreen() {
  const [s, setS] = useState<NotificationSettings | null>(null);
  const [systemAllowed, setSystemAllowed] = useState(true);

  useEffect(() => {
    getNotificationSettings().then(setS).catch(showError);
    if (PUSH_AVAILABLE) Notifications.getPermissionsAsync().then((p) => setSystemAllowed(p.granted)).catch(() => undefined);
  }, []);

  const set = async (patch: Partial<NotificationSettings>) => {
    if (!s) return;
    const prev = s;
    setS({ ...s, ...patch });
    try {
      await saveNotificationSettings(patch);
    } catch (e) {
      setS(prev);
      showError(e);
    }
  };

  const allow = async () => {
    const ok = await enablePush(true);
    setSystemAllowed(ok);
    if (!ok) Linking.openSettings();
  };

  return (
    <Screen edges={[]}>
      {!PUSH_AVAILABLE ? <P muted small>{t('push.unavailable')}</P> : null}
      {PUSH_AVAILABLE && !systemAllowed ? (
        <Card>
          <P>{t('push.systemOff')}</P>
          <Button title={t('push.enable')} icon="notifications" onPress={allow} />
        </Card>
      ) : null}
      {s ? (
        <>
          <Card>
            <ToggleRow label={t('push.matches')} value={s.matches} onChange={(v) => set({ matches: v })} />
          </Card>
          <Card>
            <ToggleRow label={t('push.messages')} value={s.messages} onChange={(v) => set({ messages: v })} />
            <ToggleRow label={t('push.preview')} value={s.message_preview} onChange={(v) => set({ message_preview: v })} disabled={!s.messages} />
            <P muted small>{t('push.previewHint')}</P>
          </Card>
          <Card>
            <ToggleRow label={t('push.station')} value={s.station_activity} onChange={(v) => set({ station_activity: v })} />
            <P muted small>{t('push.stationHint')}</P>
          </Card>
          <P muted small>{t('push.reminder')}</P>
        </>
      ) : null}
    </Screen>
  );
}
