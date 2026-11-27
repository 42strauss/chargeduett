import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  BasicsSection,
  ModesSection,
  PhotosAboutSection,
  draftFromProfile,
  draftToRow,
  useDraft,
  validateDraft,
  type DraftErrors,
} from '@/components/ProfileForm';
import { Button, Card, H2, P, Row, Screen, Title, ToggleRow } from '@/components/ui';
import { giveConsents, upsertMyProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { showError } from '@/lib/errors';
import { getLocale, t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const STEPS = ['basics', 'modes', 'photos', 'consents'] as const;

export default function Onboarding() {
  const c = useTheme();
  const { setProfile, signOut } = useAuth();
  const { draft, set } = useDraft(draftFromProfile(null));
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [consent, setConsent] = useState({ terms: false, location: true, data_sharing: false, ads_personalization: false });
  const [termsError, setTermsError] = useState(false);
  const [busy, setBusy] = useState(false);

  const current = STEPS[step];

  const next = async () => {
    if (current !== 'consents') {
      const e = validateDraft(draft, current);
      setErrors(e);
      if (Object.keys(e).length === 0) setStep(step + 1);
      return;
    }
    if (!consent.terms) return setTermsError(true);
    setBusy(true);
    try {
      const row = draftToRow(draft);
      const profile = await upsertMyProfile({ ...row, locale: getLocale() } as never, true);
      await giveConsents({
        terms: true,
        privacy: true,
        location: consent.location,
        data_sharing: consent.data_sharing,
        ads_personalization: consent.ads_personalization,
      });
      setProfile(profile); // Gate leitet zur App weiter
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Title sub={t('onboarding.stepOf', { n: step + 1, total: STEPS.length })}>{t('onboarding.title')}</Title>
      <View style={{ height: 6, backgroundColor: c.chipBg, borderRadius: 3 }}>
        <View style={{ height: 6, width: `${((step + 1) / STEPS.length) * 100}%`, backgroundColor: c.primary, borderRadius: 3 }} />
      </View>

      {current === 'basics' ? <BasicsSection draft={draft} set={set} errors={errors} /> : null}
      {current === 'modes' ? <ModesSection draft={draft} set={set} errors={errors} /> : null}
      {current === 'photos' ? <PhotosAboutSection draft={draft} set={set} errors={errors} /> : null}
      {current === 'consents' ? (
        <View style={{ gap: 12 }}>
          <H2>{t('onboarding.consents')}</H2>
          <Card style={termsError && !consent.terms ? { borderColor: c.danger, borderWidth: 1.5 } : undefined}>
            <ToggleRow label={t('onboarding.consentTerms')} value={consent.terms} onChange={(v) => setConsent((cur) => ({ ...cur, terms: v }))} />
          </Card>
          <Card>
            <ToggleRow label={t('onboarding.consentLocation')} value={consent.location} onChange={(v) => setConsent((cur) => ({ ...cur, location: v }))} />
          </Card>
          <Card>
            <ToggleRow label={t('onboarding.consentDataSharing')} value={consent.data_sharing} onChange={(v) => setConsent((cur) => ({ ...cur, data_sharing: v }))} />
          </Card>
          <Card>
            <ToggleRow
              label={t('onboarding.consentAds')}
              value={consent.ads_personalization}
              onChange={(v) => setConsent((cur) => ({ ...cur, ads_personalization: v }))}
            />
          </Card>
          {termsError && !consent.terms ? <Text style={{ color: c.danger }}>{t('onboarding.errorTerms')}</Text> : null}
          <P muted small>{t('charge.safetyNote')}</P>
        </View>
      ) : null}

      <Row>
        <View style={{ flex: 1 }}>
          <Button variant="secondary" title={step === 0 ? t('profile.signOut') : t('common.back')} onPress={() => (step === 0 ? signOut() : setStep(step - 1))} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title={current === 'consents' ? t('onboarding.finish') : t('common.next')} onPress={next} loading={busy} />
        </View>
      </Row>
    </Screen>
  );
}
