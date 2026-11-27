import { useState } from 'react';
import { Text, View } from 'react-native';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import type { AppMode, Gender, Profile } from '@/lib/types';
import { PhotoGrid } from './PhotoGrid';
import { Button, Card, Chip, Field, H2, P, Row } from './ui';

export const MODES: AppMode[] = ['friendship', 'networking', 'dating'];
export const GENDERS: Gender[] = ['female', 'male', 'diverse'];

export interface ProfileDraft {
  display_name: string;
  birthdate: string; // TT.MM.JJJJ in der Eingabe
  gender: Gender | null;
  modes: AppMode[];
  dating_genders: Gender[];
  age_min: number;
  age_max: number;
  photos: string[];
  bio: string;
  occupation: string;
}

export function draftFromProfile(p: Profile | null): ProfileDraft {
  return {
    display_name: p?.display_name ?? '',
    birthdate: p ? p.birthdate.split('-').reverse().join('.') : '',
    gender: p?.gender ?? null,
    modes: p?.modes ?? ['friendship', 'networking'],
    dating_genders: p?.dating_genders ?? [],
    age_min: p?.age_min ?? 18,
    age_max: p?.age_max ?? 99,
    photos: p?.photos ?? [],
    bio: p?.bio ?? '',
    occupation: p?.occupation ?? '',
  };
}

/** "24.12.1990" → "1990-12-24" oder null, wenn ungültig */
export function parseGermanDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function ageFromIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

export type DraftErrors = Partial<Record<'display_name' | 'birthdate' | 'gender' | 'modes' | 'photos' | 'dating_genders', string>>;

export function validateDraft(d: ProfileDraft, part: 'basics' | 'modes' | 'photos' | 'all'): DraftErrors {
  const e: DraftErrors = {};
  if (part === 'basics' || part === 'all') {
    const n = d.display_name.trim();
    if (n.length < 2 || n.length > 30) e.display_name = t('onboarding.errorName');
    const iso = parseGermanDate(d.birthdate);
    if (!iso) e.birthdate = t('onboarding.errorDate');
    else if (ageFromIso(iso) < 18) e.birthdate = t('onboarding.errorUnderage');
    else if (ageFromIso(iso) > 106) e.birthdate = t('onboarding.errorDate');
    if (!d.gender) e.gender = ' ';
  }
  if (part === 'modes' || part === 'all') {
    if (d.modes.length === 0) e.modes = t('onboarding.errorModes');
    if (d.modes.includes('dating') && d.dating_genders.length === 0) e.dating_genders = t('onboarding.errorDatingGenders');
  }
  if (part === 'photos' || part === 'all') {
    if (d.photos.length === 0) e.photos = t('onboarding.errorPhoto');
  }
  return e;
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function BasicsSection({
  draft,
  set,
  errors,
  birthdateLocked,
}: {
  draft: ProfileDraft;
  set: (p: Partial<ProfileDraft>) => void;
  errors: DraftErrors;
  birthdateLocked?: boolean;
}) {
  const c = useTheme();
  return (
    <View style={{ gap: 16 }}>
      <Field
        label={t('onboarding.name')}
        placeholder={t('onboarding.namePlaceholder')}
        value={draft.display_name}
        onChangeText={(v) => set({ display_name: v })}
        maxLength={30}
        autoComplete="given-name"
        error={errors.display_name}
      />
      <Field
        label={t('onboarding.birthdate')}
        placeholder="24.12.1990"
        value={draft.birthdate}
        onChangeText={(v) => set({ birthdate: v.replace(/[^\d.]/g, '') })}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        editable={!birthdateLocked}
        hint={t('onboarding.birthdateHint')}
        error={errors.birthdate}
      />
      <View style={{ gap: 8 }}>
        <Text style={{ color: errors.gender ? c.danger : c.text, fontWeight: '600' }}>{t('onboarding.gender')}</Text>
        <Row wrap>
          {GENDERS.map((g) => (
            <Chip key={g} label={t(`genders.${g}`)} selected={draft.gender === g} onPress={() => set({ gender: g })} />
          ))}
        </Row>
      </View>
    </View>
  );
}

export function ModesSection({ draft, set, errors }: { draft: ProfileDraft; set: (p: Partial<ProfileDraft>) => void; errors: DraftErrors }) {
  const c = useTheme();
  const step = (k: 'age_min' | 'age_max', delta: number) => {
    const v = Math.min(99, Math.max(18, draft[k] + delta));
    if (k === 'age_min' && v > draft.age_max) return;
    if (k === 'age_max' && v < draft.age_min) return;
    set({ [k]: v } as Partial<ProfileDraft>);
  };
  return (
    <View style={{ gap: 16 }}>
      <H2>{t('onboarding.modes')}</H2>
      {MODES.map((m) => (
        <Card key={m} style={{ borderColor: draft.modes.includes(m) ? c.primary : c.border, borderWidth: 1.5 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{t(`modes.${m}`)}</Text>
              <P muted small>{t(`modeHints.${m}`)}</P>
            </View>
            <Chip label={draft.modes.includes(m) ? '✓' : '+'} selected={draft.modes.includes(m)} onPress={() => set({ modes: toggle(draft.modes, m) })} />
          </Row>
        </Card>
      ))}
      {errors.modes ? <Text style={{ color: c.danger }}>{errors.modes}</Text> : null}
      {draft.modes.includes('dating') ? (
        <Card>
          <Text style={{ color: errors.dating_genders ? c.danger : c.text, fontWeight: '600' }}>{t('onboarding.datingPrefs')}</Text>
          <Row wrap>
            {GENDERS.map((g) => (
              <Chip key={g} label={t(`genders.${g}`)} selected={draft.dating_genders.includes(g)} onPress={() => set({ dating_genders: toggle(draft.dating_genders, g) })} />
            ))}
          </Row>
          <Text style={{ color: c.text }}>{t('onboarding.ageRange', { min: draft.age_min, max: draft.age_max })}</Text>
          <Row wrap>
            <Button small variant="secondary" title="min −" onPress={() => step('age_min', -1)} />
            <Button small variant="secondary" title="min +" onPress={() => step('age_min', 1)} />
            <Button small variant="secondary" title="max −" onPress={() => step('age_max', -1)} />
            <Button small variant="secondary" title="max +" onPress={() => step('age_max', 1)} />
          </Row>
        </Card>
      ) : null}
    </View>
  );
}

export function PhotosAboutSection({ draft, set, errors }: { draft: ProfileDraft; set: (p: Partial<ProfileDraft>) => void; errors: DraftErrors }) {
  const c = useTheme();
  return (
    <View style={{ gap: 16 }}>
      <H2>{t('onboarding.photos')}</H2>
      <P muted small>{t('onboarding.photosHint')}</P>
      <PhotoGrid photos={draft.photos} onChange={(photos) => set({ photos })} />
      {errors.photos ? <Text style={{ color: c.danger }}>{errors.photos}</Text> : null}
      <H2>{t('onboarding.about')}</H2>
      <Field
        multiline
        placeholder={t('onboarding.bioPlaceholder')}
        value={draft.bio}
        onChangeText={(bio) => set({ bio })}
        maxLength={500}
        hint={`${draft.bio.length}/500`}
      />
      <Field label={`${t('onboarding.occupation')} (${t('common.optional')})`} value={draft.occupation} onChangeText={(occupation) => set({ occupation })} maxLength={60} />
    </View>
  );
}

/** Wandelt den Entwurf in Spalten für die profiles-Tabelle. */
export function draftToRow(d: ProfileDraft) {
  return {
    display_name: d.display_name.trim(),
    birthdate: parseGermanDate(d.birthdate) ?? undefined,
    gender: d.gender ?? undefined,
    modes: d.modes,
    dating_genders: d.modes.includes('dating') ? d.dating_genders : [],
    age_min: d.age_min,
    age_max: d.age_max,
    photos: d.photos,
    bio: d.bio.trim() || null,
    occupation: d.occupation.trim() || null,
  };
}

export function useDraft(initial: ProfileDraft) {
  const [draft, setDraft] = useState(initial);
  const set = (p: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...p }));
  return { draft, set, setDraft };
}
