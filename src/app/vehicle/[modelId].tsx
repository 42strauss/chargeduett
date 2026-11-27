/** Modell-Detail: technische Daten, Community-Bewertungen, eigene Bewertung. */
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Field, H2, P, Row, Screen, Stars } from '@/components/ui';
import { getModel, modelReviews, modelScore, myRating, myVehicles, saveRating } from '@/lib/api';
import { showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { RATING_CRITERIA, type ModelReview, type ModelScore, type RatingCriterion, type VehicleModel } from '@/lib/types';

type Draft = Record<RatingCriterion, number> & { comment: string };
const EMPTY: Draft = { range_real: 0, charging_speed: 0, consumption: 0, software: 0, comfort: 0, build_quality: 0, value_for_money: 0, comment: '' };

export default function ModelDetail() {
  const c = useTheme();
  const modelId = Number(useLocalSearchParams<{ modelId: string }>().modelId);
  const [model, setModel] = useState<VehicleModel | null>(null);
  const [score, setScore] = useState<ModelScore | null>(null);
  const [reviews, setReviews] = useState<ModelReview[]>([]);
  const [owns, setOwns] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [hasRating, setHasRating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, s, r, mine, garage] = await Promise.all([getModel(modelId), modelScore(modelId), modelReviews(modelId), myRating(modelId), myVehicles()]);
      setModel(m);
      setScore(s);
      setReviews(r);
      setOwns(garage.some((v) => v.model_id === modelId));
      if (mine) {
        setHasRating(true);
        setDraft({ ...mine, comment: mine.comment ?? '' });
      }
    } catch (e) {
      showError(e);
    }
  }, [modelId]);

  useEffect(() => {
    load();
  }, [load]);

  const complete = RATING_CRITERIA.every((k) => draft[k] >= 1);

  const save = async () => {
    setBusy(true);
    try {
      const { comment, ...stars } = draft;
      await saveRating({ model_id: modelId, ...stars, comment: comment.trim() || null });
      setHasRating(true);
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const title = model ? `${model.make} ${model.model}` : '';
  const spec = (label: string, v: number | null | undefined, unit: string) =>
    v ? (
      <Row>
        <Text style={{ color: c.muted, flex: 1 }}>{label}</Text>
        <Text style={{ color: c.text, fontWeight: '600' }}>
          {String(v).replace('.', ',')} {unit}
        </Text>
      </Row>
    ) : null;

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title }} />
      <View style={{ gap: 4 }}>
        <Text style={{ color: c.text, fontSize: 26, fontWeight: '800' }}>{title}</Text>
        {model?.variant ? <P muted>{model.variant}</P> : null}
      </View>

      <Card>
        <Row>
          <Text style={{ color: c.text, fontSize: 40, fontWeight: '900' }}>{score?.rating_count ? Number(score.overall).toFixed(1) : '–'}</Text>
          <View style={{ gap: 4 }}>
            <Stars value={score?.overall ?? 0} size={20} />
            <P muted small>{score?.rating_count ? t('vehicles.ratings', { n: score.rating_count }) : t('vehicles.noRatings')}</P>
          </View>
        </Row>
        {score?.rating_count
          ? RATING_CRITERIA.map((k) => (
              <Row key={k}>
                <Text style={{ color: c.text, flex: 1 }}>{t(`vehicles.criteria.${k}`)}</Text>
                <Stars value={score[k]} size={14} />
                <Text style={{ color: c.muted, width: 32, textAlign: 'right' }}>{Number(score[k]).toFixed(1)}</Text>
              </Row>
            ))
          : null}
      </Card>

      {model ? (
        <Card>
          <H2>{t('vehicles.specs')}</H2>
          {spec(t('vehicles.battery'), model.battery_kwh_net, 'kWh')}
          {spec(t('vehicles.dcMax'), model.dc_max_kw, 'kW')}
          {spec(t('vehicles.acMax'), model.ac_max_kw, 'kW')}
          {spec(t('vehicles.wltp'), model.wltp_range_km, 'km')}
        </Card>
      ) : null}

      <Card>
        <H2>{t('vehicles.yourRating')}</H2>
        {owns ? (
          <>
            {RATING_CRITERIA.map((k) => (
              <View key={k} style={{ gap: 6 }}>
                <Text style={{ color: c.text }}>{t(`vehicles.criteria.${k}`)}</Text>
                <Stars value={draft[k]} size={28} onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} />
              </View>
            ))}
            <Field multiline placeholder={t('vehicles.comment')} value={draft.comment} onChangeText={(comment) => setDraft((d) => ({ ...d, comment }))} maxLength={1000} />
            <Button title={hasRating ? t('common.save') : t('vehicles.rate')} onPress={save} disabled={!complete} loading={busy} />
          </>
        ) : (
          <P muted>{t('vehicles.ownToRate')}</P>
        )}
      </Card>

      {reviews.length ? <H2>{t('vehicles.reviews')}</H2> : null}
      {reviews.map((r) => (
        <Card key={r.id}>
          <Row>
            <Stars value={r.overall} size={14} />
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {r.author} · {new Date(r.updated_at).toLocaleDateString()}
            </Text>
          </Row>
          {r.comment ? <P>{r.comment}</P> : null}
        </Card>
      ))}
    </Screen>
  );
}
