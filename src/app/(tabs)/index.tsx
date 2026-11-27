/** Tab "Laden": Check-in/Check-out und Schnelllader in der Nähe (nur Anzahl ladender Personen). */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PodcastBadge } from '@/components/PodcastBadge';
import { Button, Card, Chip, H2, P, Row, Title } from '@/components/ui';
import { myVehicles, nearbyStations } from '@/lib/api';
import { useCharging } from '@/lib/charging';
import { errorCode, showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { currentPosition, formatDistance } from '@/lib/location';
import { radius, space, useTheme } from '@/lib/theme';
import type { NearbyStation, UserVehicle } from '@/lib/types';

function useMinutesLeft(expiresAt?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return expiresAt ? Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60000)) : 0;
}

export default function ChargeScreen() {
  const c = useTheme();
  const router = useRouter();
  const { session, checkIn, checkOut, extend, refresh } = useCharging();
  const [stations, setStations] = useState<NearbyStation[] | null>(null);
  const [locDenied, setLocDenied] = useState(false);
  const [vehicles, setVehicles] = useState<UserVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const minutesLeft = useMinutesLeft(session?.expires_at);

  const load = useCallback(async () => {
    try {
      const [pos, v] = await Promise.all([currentPosition(true), myVehicles()]);
      setVehicles(v);
      setVehicleId((cur) => cur ?? v.find((x) => x.is_primary)?.id ?? v[0]?.id ?? null);
      if (!pos) {
        setLocDenied(true);
        setStations([]);
        return;
      }
      setLocDenied(false);
      setStations(await nearbyStations(pos.lat, pos.lng, 25));
    } catch (e) {
      setStations([]);
      showError(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      refresh();
    }, [load, refresh]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  };

  const doCheckIn = async (stationId?: number) => {
    setBusy('in');
    try {
      await checkIn(vehicleId, stationId);
      await load();
    } catch (e) {
      const code = e instanceof Error && e.message === 'LOCATION_DENIED' ? 'denied' : errorCode(e);
      if (code === 'denied')
        Alert.alert(t('charge.title'), t('charge.locationDenied'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('charge.openSettings'), onPress: () => Linking.openSettings() },
        ]);
      else if (code === 'NO_STATION_NEARBY') Alert.alert(t('charge.title'), t('charge.noStationNearby'));
      else if (code === 'LOCATION_CONSENT_MISSING') Alert.alert(t('charge.title'), t('charge.locationConsentMissing'));
      else showError(e);
    } finally {
      setBusy(null);
    }
  };

  const doCheckOut = async () => {
    setBusy('out');
    try {
      await checkOut();
      await load();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: space(4), gap: space(4), paddingBottom: space(10) }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />}
      >
        <Title>{t('charge.title')}</Title>

        {session ? (
          <Card style={{ backgroundColor: c.primary, borderColor: c.primary }}>
            <Row>
              <Ionicons name="flash" size={22} color={c.primaryText} />
              <Text style={{ color: c.primaryText, fontWeight: '600' }}>{t('charge.youAreCharging')}</Text>
            </Row>
            <Text style={{ color: c.primaryText, fontSize: 22, fontWeight: '800' }}>{session.station_name}</Text>
            <Row wrap gap={16}>
              <Text style={{ color: c.primaryText }}>👥 {t('charge.peopleHere', { n: session.people_here })}</Text>
              <Text style={{ color: c.primaryText }}>📍 {t('charge.peopleNearby', { n: session.people_nearby })}</Text>
            </Row>
            <Text style={{ color: c.primaryText, opacity: 0.85 }}>{t('charge.endsIn', { min: minutesLeft })}</Text>
            <View style={{ gap: 10, marginTop: 4 }}>
              <Button title={t('charge.discoverCta')} icon="people" variant="secondary" onPress={() => router.navigate('/discover')} />
              <Row>
                <View style={{ flex: 1 }}>
                  <Button small variant="secondary" title={t('charge.extend')} onPress={() => extend().catch(showError)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button small variant="danger" title={t('charge.checkOut')} onPress={doCheckOut} loading={busy === 'out'} />
                </View>
              </Row>
            </View>
          </Card>
        ) : (
          <Card>
            {vehicles.length > 1 ? (
              <>
                <P>{t('charge.whichVehicle')}</P>
                <Row wrap>
                  {vehicles.map((v) => (
                    <Chip
                      key={v.id}
                      icon="car-sport"
                      label={v.nickname || `${v.vehicle_models?.make} ${v.vehicle_models?.model}`}
                      selected={vehicleId === v.id}
                      onPress={() => setVehicleId(v.id)}
                    />
                  ))}
                </Row>
              </>
            ) : vehicles.length === 0 ? (
              <P muted small>{t('charge.addVehicleFirst')}</P>
            ) : null}
            <Button title={t('charge.checkIn')} icon="flash" onPress={() => doCheckIn()} loading={busy === 'in'} />
            <P muted small>{t('charge.safetyNote')}</P>
          </Card>
        )}

        <H2>{t('charge.nearby')}</H2>
        {stations === null ? (
          <ActivityIndicator color={c.primary} />
        ) : locDenied ? (
          <P muted>{t('charge.locationDenied')}</P>
        ) : stations.length === 0 ? (
          <P muted>{t('charge.noStations')}</P>
        ) : (
          stations.slice(0, 40).map((s) => <StationRow key={s.id} s={s} active={session?.station_id === s.id} />)
        )}
        <P muted small>{t('profile.dataSources')}</P>
        <PodcastBadge size="sm" />
      </ScrollView>
    </SafeAreaView>
  );
}

function StationRow({ s, active }: { s: NearbyStation; active: boolean }) {
  const c = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: radius.md,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: active ? 2 : 0,
        borderColor: c.primary,
      }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.chipBg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={s.is_highway ? 'car' : 'flash'} size={22} color={c.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.text, fontWeight: '700' }} numberOfLines={1}>
          {s.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
          {formatDistance(s.distance_m)} · {Math.round(s.max_power_kw)} kW
          {s.is_highway ? ` · ${t('charge.highway')}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: s.active_users > 0 ? c.primary : c.muted, fontWeight: '700', fontSize: 13 }}>
          {s.active_users === 0
            ? t('charge.nobodyCharging')
            : t(s.active_users === 1 ? 'charge.charging' : 'charge.chargingPlural', { n: s.active_users })}
        </Text>
      </View>
    </View>
  );
}
