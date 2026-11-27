import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { uploadPhoto } from '@/lib/api';
import { showError } from '@/lib/errors';
import { photoUrl } from '@/lib/supabase';
import { radius, useTheme } from '@/lib/theme';

const MAX = 6;

/** Fotoraster: Tippen auf leeres Feld = hinzufügen, auf Foto = entfernen. Erstes Foto = Hauptfoto. */
export function PhotoGrid({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const c = useTheme();
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      const a = res.assets[0];
      const path = await uploadPhoto(a.uri, a.mimeType ?? 'image/jpeg');
      onChange([...photos, path].slice(0, MAX));
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const slots = Array.from({ length: MAX }, (_, i) => photos[i] ?? null);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {slots.map((p, i) => (
        <Pressable
          key={p ?? `empty-${i}`}
          onPress={p ? () => onChange(photos.filter((x) => x !== p)) : add}
          disabled={busy || (!p && i !== photos.length)}
          style={{
            width: '30%',
            aspectRatio: 3 / 4,
            borderRadius: radius.md,
            backgroundColor: c.chipBg,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: i === 0 ? 2 : 0,
            borderColor: c.primary,
          }}
        >
          {p ? (
            <>
              <Image source={{ uri: photoUrl(p) }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              <View style={{ position: 'absolute', top: 6, right: 6, backgroundColor: c.overlay, borderRadius: 12, padding: 2 }}>
                <Ionicons name="close" size={16} color="#fff" />
              </View>
            </>
          ) : busy && i === photos.length ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <Ionicons name="add" size={28} color={i === photos.length ? c.primary : c.border} />
          )}
        </Pressable>
      ))}
    </View>
  );
}
