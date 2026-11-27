import { useEffect, useState } from 'react';
import { Platform, Share, Text } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Alert } from '@/lib/dialog';
import { Button, Card, H2, P, Screen, ToggleRow } from '@/components/ui';
import { showAdPrivacyOptions } from '@/lib/ads';
import { deleteMyAccount, exportMyData, getMyConsents, giveConsents } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import type { ConsentType } from '@/lib/types';

export default function Privacy() {
  const { profile } = useAuth();
  const c = useTheme();
  const [consents, setConsents] = useState<Record<ConsentType, boolean> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);

  useEffect(() => {
    getMyConsents().then(setConsents).catch(showError);
  }, []);

  const toggle = async (type: ConsentType, value: boolean) => {
    if (!consents) return;
    setConsents({ ...consents, [type]: value });
    try {
      await giveConsents({ [type]: value });
    } catch (e) {
      setConsents({ ...consents });
      showError(e);
    }
  };

  const doExport = async () => {
    setBusy('export');
    try {
      const data = await exportMyData();
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        setExported(json); // Downloads sind im Web/Artefakt oft gesperrt → anzeigen
      } else {
        await Share.share({ title: 'chargeduett-daten.json', message: json });
      }
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const doDelete = () =>
    Alert.alert(t('privacy.deleteAccount'), t('privacy.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setBusy('delete');
          try {
            await deleteMyAccount(profile?.photos ?? []);
            Alert.alert(t('privacy.deleted'));
          } catch (e) {
            showError(e);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);

  return (
    <Screen edges={[]}>
      <H2>{t('privacy.consents')}</H2>
      <P muted small>{t('privacy.consentsHint')}</P>
      {consents ? (
        <>
          <Card>
            <ToggleRow label={t('onboarding.consentLocation')} value={consents.location} onChange={(v) => toggle('location', v)} />
          </Card>
          <Card>
            <ToggleRow label={t('onboarding.consentDataSharing')} value={consents.data_sharing} onChange={(v) => toggle('data_sharing', v)} />
          </Card>
          <Card>
            <ToggleRow label={t('onboarding.consentAds')} value={consents.ads_personalization} onChange={(v) => toggle('ads_personalization', v)} />
            <Button small variant="ghost" title={t('privacy.adSettings')} onPress={showAdPrivacyOptions} />
          </Card>
        </>
      ) : null}

      <H2>{t('privacy.export')}</H2>
      <P muted small>{t('privacy.exportHint')}</P>
      <Button title={t('privacy.export')} icon="download-outline" variant="secondary" onPress={doExport} loading={busy === 'export'} />
      {exported ? (
        <Card>
          <Text selectable style={{ color: c.muted, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 11 }}>
            {exported}
          </Text>
          <Button small variant="ghost" title={t('common.done')} onPress={() => setExported(null)} />
        </Card>
      ) : null}

      <H2>{t('privacy.deleteAccount')}</H2>
      <Button title={t('privacy.deleteAccount')} icon="trash-outline" variant="danger" onPress={doDelete} loading={busy === 'delete'} />
    </Screen>
  );
}
