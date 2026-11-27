/** Tab "Entdecken": Swipe-Stapel der Personen, die im Umkreis gerade laden. */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProfileCard } from '@/components/ProfileCard';
import { SwipeDeck } from '@/components/SwipeDeck';
import { Avatar, Button, Chip, Empty, P, Row } from '@/components/ui';
import { AdRectangle } from '@/lib/ads';
import { discoveryCandidates, swipe } from '@/lib/api';
import { enablePush } from '@/lib/push';
import { useAuth } from '@/lib/auth';
import { useCharging } from '@/lib/charging';
import { errorCode, showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { radius, space, useTheme } from '@/lib/theme';
import type { AppMode, Candidate } from '@/lib/types';

const AD_EVERY = 10; // nach jeweils 10 Profilen eine Werbekarte

type DeckItem = { kind: 'person'; person: Candidate } | { kind: 'ad'; id: string };

export default function Discover() {
  const c = useTheme();
  const router = useRouter();
  const { profile } = useAuth();
  const { session } = useCharging();
  const modes: AppMode[] = profile?.modes ?? ['friendship'];
  const [mode, setMode] = useState<AppMode>(modes[0]);
  const [radiusKm, setRadiusKm] = useState<number>(50); // 50 | 250 | 0 = bundesweit
  const [deck, setDeck] = useState<DeckItem[] | null>(null);
  const [match, setMatch] = useState<{ id: string; person: Candidate } | null>(null);

  const load = useCallback(async () => {
    if (!session) return setDeck([]);
    setDeck(null);
    try {
      const people = await discoveryCandidates(mode, radiusKm);
      // Werbekarten einstreuen
      const withAds: DeckItem[] = [];
      people.forEach((person, i) => {
        withAds.push({ kind: 'person', person });
        if ((i + 1) % AD_EVERY === 0) withAds.push({ kind: 'ad', id: `ad-${Date.now()}-${i}` });
      });
      setDeck(withAds);
    } catch (e) {
      setDeck([]);
      showError(e);
    }
  }, [session, mode, radiusKm]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onSwipe = async (item: DeckItem, dir: 'like' | 'pass') => {
    setDeck((d) => (d ? d.slice(1) : d));
    if (item.kind === 'ad') return;
    try {
      const res = await swipe(item.person.user_id, dir, mode);
      if (res.matched && res.match_id) {
        setMatch({ id: res.match_id, person: item.person });
        // Erst jetzt nach Push-Erlaubnis fragen: der Nutzer versteht, wofür (Antworten nicht verpassen)
        enablePush(true).catch(() => undefined);
      }
    } catch (e) {
      // Person ist inzwischen weg – still ignorieren
      if (errorCode(e) !== 'TARGET_NOT_AVAILABLE') showError(e);
    }
  };

  const header = useMemo(
    () => (
      <View style={{ gap: 8 }}>
        <Row wrap>
          {modes.map((m) => (
            <Chip key={m} label={t(`modes.${m}`)} selected={mode === m} onPress={() => setMode(m)} />
          ))}
        </Row>
        <Row wrap gap={6}>
          <Text style={{ color: c.muted, fontSize: 13 }}>{t('discover.radius')}:</Text>
          {[50, 250, 0].map((r) => (
            <Chip key={r} icon={r === 0 ? 'globe-outline' : 'locate-outline'} label={r === 0 ? t('discover.radiusAll') : `${r} km`} selected={radiusKm === r} onPress={() => setRadiusKm(r)} />
          ))}
        </Row>
      </View>
    ),
    [modes, mode, radiusKm, c.muted],
  );

  let body;
  if (!session) {
    body = (
      <Empty
        icon="flash-outline"
        text={t('discover.notCharging')}
        action={<Button title={t('discover.goCharge')} icon="flash" onPress={() => router.navigate('/')} />}
      />
    );
  } else if (deck === null) {
    body = <ActivityIndicator style={{ flex: 1 }} color={c.primary} />;
  } else if (deck.length === 0) {
    body = (
      <Empty
        icon="people-outline"
        text={t('discover.empty')}
        action={
          <View style={{ gap: 10 }}>
            {radiusKm !== 0 ? <Button title={t('discover.showNationwide')} icon="globe-outline" onPress={() => setRadiusKm(0)} /> : null}
            <Button title={t('discover.refresh')} icon="refresh" variant="secondary" onPress={load} />
          </View>
        }
      />
    );
  } else {
    body = (
      <SwipeDeck
        items={deck}
        keyOf={(it) => (it.kind === 'ad' ? it.id : it.person.user_id)}
        disabledFor={(it) => it.kind === 'ad'}
        onSwipe={onSwipe}
        renderItem={(it) => (it.kind === 'ad' ? <AdCard /> : <ProfileCard person={it.person} />)}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg, padding: space(4), gap: space(3) }}>
      <Row>
        <Ionicons name="flash" size={26} color={c.primary} />
        <Text style={{ fontSize: 26, fontWeight: '900', color: c.text, flex: 1 }}>{t('brand.appName')}</Text>
        {session ? (
          <Text style={{ color: c.muted, fontSize: 12, maxWidth: 160 }} numberOfLines={1}>
            {session.station_name}
          </Text>
        ) : null}
      </Row>
      {header}
      <View style={{ flex: 1 }}>{body}</View>

      <Modal visible={!!match} transparent animationType="fade" onRequestClose={() => setMatch(null)}>
        <View style={{ flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: c.card, borderRadius: radius.lg, padding: 24, gap: 16, alignItems: 'center', width: '100%' }}>
            <Text style={{ fontSize: 30, fontWeight: '900', color: c.primary, textAlign: 'center' }}>{t('discover.matchTitle')}</Text>
            <Row gap={-12}>
              <Avatar path={profile?.photos[0]} size={96} />
              <Avatar path={match?.person.photos[0]} size={96} />
            </Row>
            <P center>{t('discover.matchText', { name: match?.person.display_name ?? '' })}</P>
            <View style={{ alignSelf: 'stretch', gap: 10 }}>
              <Button
                title={t('discover.sendMessage')}
                icon="chatbubble"
                onPress={() => {
                  const id = match?.id;
                  setMatch(null);
                  if (id) router.push({ pathname: '/chat/[matchId]', params: { matchId: id } });
                }}
              />
              <Button variant="ghost" title={t('discover.keepSwiping')} onPress={() => setMatch(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function AdCard() {
  const c = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: radius.lg, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
      <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{t('discover.sponsored')}</Text>
      <AdRectangle />
    </View>
  );
}
