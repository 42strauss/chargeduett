import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { Button, Chip, H2, Row, Screen } from '@/components/ui';
import { deletePhotos, upsertMyProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { showError } from '@/lib/errors';
import { setLocale, t } from '@/lib/i18n';

export default function EditProfile() {
  const router = useRouter();
  const { profile, setProfile } = useAuth();
  const { draft, set } = useDraft(draftFromProfile(profile));
  const [locale, setLoc] = useState(profile?.locale ?? 'de');
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e = validateDraft(draft, 'all');
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      // Geburtsdatum ist gesperrt → nicht mitschicken
      const { birthdate: _b, ...row } = draftToRow(draft);
      const updated = await upsertMyProfile({ ...row, locale } as never, false);
      const removed = (profile?.photos ?? []).filter((p) => !draft.photos.includes(p));
      deletePhotos(removed).catch(() => undefined);
      setLocale(locale);
      setProfile(updated);
      router.back();
    } catch (err) {
      showError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={[]}>
      <PhotosAboutSection draft={draft} set={set} errors={errors} />
      <BasicsSection draft={draft} set={set} errors={errors} birthdateLocked />
      <ModesSection draft={draft} set={set} errors={errors} />
      <H2>Sprache / Language</H2>
      <Row>
        <Chip label="Deutsch" selected={locale === 'de'} onPress={() => setLoc('de')} />
        <Chip label="English" selected={locale === 'en'} onPress={() => setLoc('en')} />
      </Row>
      <Button title={t('common.save')} onPress={save} loading={busy} />
    </Screen>
  );
}
