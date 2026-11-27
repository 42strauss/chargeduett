/** Tab "Fahrzeuge": eigene Garage + Community-Ranking aller Modelle. */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { Button, Card, Chip, Field, H2, P, Row, Screen, Stars, Title } from '@/components/ui';
import { AdBanner } from '@/lib/ads';
import { deleteVehicle, modelScores, myVehicles, setPrimaryVehicle } from '@/lib/api';
import { showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { radius, useTheme } from '@/lib/theme';
import type { ModelScore, UserVehicle } from '@/lib/types';

export default function Vehicles() {
  const c = useTheme();
  const router = useRouter();
  const [garage, setGarage] = useState<UserVehicle[]>([]);
  const [scores, setScores] = useState<ModelScore[]>([]);
  const [query, setQuery] = useState('');
  const [onlyRated, setOnlyRated] = useState(true);

  const load = useCallback(async () => {
    try {
      const [g, s] = await Promise.all([myVehicles(), modelScores(query)]);
      setGarage(g);
      setScores(s);
    } catch (e) {
      showError(e);
    }
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const remove = (v: UserVehicle) =>
    Alert.alert('', t('vehicles.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteVehicle(v.id).then(load).catch(showError) },
    ]);

  const list = onlyRated && !query ? scores.filter((s) => s.rating_count > 0) : scores;

  return (
    <Screen>
      <Title>{t('vehicles.title')}</Title>

      <Row>
        <View style={{ flex: 1 }}>
          <H2>{t('vehicles.myGarage')}</H2>
        </View>
        <Button small icon="add" title={t('vehicles.add')} onPress={() => router.push('/vehicle/add')} />
      </Row>
      {garage.length === 0 ? <P muted>{t('vehicles.empty')}</P> : null}
      {garage.map((v) => (
        <Card key={v.id}>
          <Row>
            <Ionicons name="car-sport" size={26} color={c.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>{v.nickname || v.vehicle_models?.model}</Text>
              <Text style={{ color: c.muted }}>
                {v.vehicle_models?.make} {v.vehicle_models?.model} {v.vehicle_models?.variant}
                {v.model_year ? ` · ${v.model_year}` : ''}
              </Text>
            </View>
            {v.is_primary ? <Chip label={t('vehicles.primary')} selected /> : null}
          </Row>
          {v.description ? <P muted small>{v.description}</P> : null}
          <Row wrap>
            <Button small title={t('vehicles.rate')} icon="star" onPress={() => router.push({ pathname: '/vehicle/[modelId]', params: { modelId: String(v.model_id) } })} />
            {!v.is_primary ? <Button small variant="secondary" title={t('vehicles.makePrimary')} onPress={() => setPrimaryVehicle(v.id).then(load).catch(showError)} /> : null}
            <Button small variant="ghost" title={t('common.delete')} onPress={() => remove(v)} />
          </Row>
        </Card>
      ))}

      <View style={{ gap: 4, marginTop: 8 }}>
        <H2>{t('vehicles.ranking')}</H2>
        <P muted small>{t('vehicles.rankingHint')}</P>
      </View>
      <Field placeholder={t('vehicles.search')} value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" />
      {!query ? (
        <Row>
          <Chip label={t('vehicles.ratings', { n: '≥ 1' })} selected={onlyRated} onPress={() => setOnlyRated(!onlyRated)} />
        </Row>
      ) : null}

      {list.length === 0 ? <P muted>{t('vehicles.noRatings')}</P> : null}
      {list.map((s, i) => (
        <View key={s.model_id} style={{ gap: 12 }}>
          {i === 5 ? <AdBanner /> : null}
          <Pressable
            onPress={() => router.push({ pathname: '/vehicle/[modelId]', params: { modelId: String(s.model_id) } })}
            style={({ pressed }) => ({
              backgroundColor: c.card,
              borderRadius: radius.md,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: c.muted, fontWeight: '800', width: 28 }}>{s.rating_count > 0 ? `#${i + 1}` : '–'}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.text, fontWeight: '700' }}>
                {s.make} {s.model} {s.variant}
              </Text>
              <Row>
                <Stars value={s.overall} size={14} />
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  {s.rating_count > 0 ? `${Number(s.overall).toFixed(1)} · ${t('vehicles.ratings', { n: s.rating_count })}` : t('vehicles.noRatings')}
                </Text>
              </Row>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </Pressable>
        </View>
      ))}
    </Screen>
  );
}
