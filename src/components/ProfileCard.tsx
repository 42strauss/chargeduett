import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { t } from '@/lib/i18n';
import { photoUrl } from '@/lib/supabase';
import { radius, useTheme } from '@/lib/theme';
import type { Candidate } from '@/lib/types';

/** Vollbild-Karte im Swipe-Stapel. Tippen links/rechts blättert durch die Fotos. */
export function ProfileCard({ person }: { person: Candidate }) {
  const c = useTheme();
  const [idx, setIdx] = useState(0);
  const photos = person.photos.length ? person.photos : [null];
  const car = [person.vehicle_make, person.vehicle_model].filter(Boolean).join(' ');

  return (
    <View style={{ flex: 1, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.card }}>
      {photos[idx] ? (
        <Image source={{ uri: photoUrl(photos[idx]) }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" transition={150} />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={96} color={c.muted} />
        </View>
      )}

      {/* Foto-Navigation */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
        <Pressable style={{ flex: 1 }} onPress={() => setIdx((i) => Math.max(0, i - 1))} />
        <Pressable style={{ flex: 1 }} onPress={() => setIdx((i) => Math.min(photos.length - 1, i + 1))} />
      </View>
      {photos.length > 1 ? (
        <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 4 }}>
          {photos.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.4)' }} />
          ))}
        </View>
      ) : null}

      {/* Info-Block */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 18, gap: 6, backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={person.same_station ? 'flash' : 'navigate'} size={14} color={c.primary} />
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 13 }}>
            {t(`discover.${person.distance_bucket === 'same_station' ? 'sameStation' : person.distance_bucket}`)}
          </Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>
          {person.display_name}, {person.age}
        </Text>
        {person.occupation ? <Text style={{ color: '#fff', fontSize: 15 }}>{person.occupation}</Text> : null}
        {car ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="car-sport" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15 }}>
              {t('discover.drives')} {car}
              {person.vehicle_nickname ? ` „${person.vehicle_nickname}“` : ''}
            </Text>
          </View>
        ) : null}
        {person.bio ? (
          <Text style={{ color: '#fff', fontSize: 14, lineHeight: 19 }} numberOfLines={3}>
            {person.bio}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
