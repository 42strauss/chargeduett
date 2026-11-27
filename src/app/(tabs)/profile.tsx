import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Chip, P, Row, Screen, Title, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { photoUrl } from '@/lib/supabase';
import { radius, useTheme } from '@/lib/theme';
import { ageFromIso } from '@/components/ProfileForm';
import { PodcastBadge } from '@/components/PodcastBadge';

export default function ProfileTab() {
  const c = useTheme();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  if (!profile) return null;

  return (
    <Screen>
      <Title>{t('profile.title')}</Title>
      {profile.is_banned ? (
        <Card style={{ borderColor: c.danger, borderWidth: 1.5 }}>
          <P>{t('profile.banned')}</P>
        </Card>
      ) : null}

      <View style={{ borderRadius: radius.lg, overflow: 'hidden', aspectRatio: 3 / 4, backgroundColor: c.card }}>
        {profile.photos[0] ? <Image source={{ uri: photoUrl(profile.photos[0]) }} style={{ flex: 1 }} contentFit="cover" /> : null}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.45)', gap: 4 }}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>
            {profile.display_name}, {ageFromIso(profile.birthdate)}
          </Text>
          {profile.occupation ? <Text style={{ color: '#fff' }}>{profile.occupation}</Text> : null}
        </View>
      </View>
      <Row wrap>
        {profile.modes.map((m) => (
          <Chip key={m} label={t(`modes.${m}`)} selected />
        ))}
      </Row>
      {profile.bio ? <P>{profile.bio}</P> : null}

      <Card style={{ padding: 0, gap: 0 }}>
        <MenuItem icon="create-outline" label={t('profile.edit')} onPress={() => router.push('/settings/edit-profile')} />
        <MenuItem icon="car-sport-outline" label={t('vehicles.myGarage')} onPress={() => router.navigate('/vehicles')} />
        <MenuItem icon="notifications-outline" label={t('push.settingsTitle')} onPress={() => router.push('/settings/notifications')} />
        <MenuItem icon="shield-checkmark-outline" label={t('profile.privacy')} onPress={() => router.push('/settings/privacy')} />
        <MenuItem icon="information-circle-outline" label={t('profile.imprint')} onPress={() => router.push('/settings/imprint')} last />
      </Card>

      <Button title={t('profile.signOut')} variant="secondary" icon="log-out-outline" onPress={signOut} />
      <PodcastBadge />
      <P muted small center>
        Charge Duett · Strauss Media GmbH{'\n'}
        {t('profile.dataSources')}
      </P>
    </Screen>
  );
}

function MenuItem({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 16,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: c.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={22} color={c.primary} />
      <Text style={{ color: c.text, flex: 1, fontSize: 16 }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={c.muted} />
    </Pressable>
  );
}
