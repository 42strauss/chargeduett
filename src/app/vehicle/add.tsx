import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Field, H2, P } from '@/components/ui';
import { addVehicle, searchModels } from '@/lib/api';
import { showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import type { VehicleModel } from '@/lib/types';

export default function AddVehicle() {
  const c = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [picked, setPicked] = useState<VehicleModel | null>(null);
  const [nickname, setNickname] = useState('');
  const [description, setDescription] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => searchModels(query).then(setModels).catch(showError), 200);
    return () => clearTimeout(id);
  }, [query]);

  const save = async () => {
    if (!picked) return;
    const y = Number.parseInt(year, 10);
    setBusy(true);
    try {
      await addVehicle({
        model_id: picked.id,
        nickname: nickname.trim() || undefined,
        description: description.trim() || undefined,
        model_year: Number.isFinite(y) && y >= 2010 && y <= 2035 ? y : null,
      });
      router.back();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  if (picked) {
    return (
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg, padding: 16, gap: 16 }}>
        <Card>
          <H2>
            {picked.make} {picked.model} {picked.variant}
          </H2>
          <Button small variant="ghost" title={t('vehicles.selectModel')} onPress={() => setPicked(null)} />
        </Card>
        <Field label={t('vehicles.nickname')} placeholder={t('vehicles.nicknamePlaceholder')} value={nickname} onChangeText={setNickname} maxLength={30} />
        <Field
          label={t('vehicles.description')}
          placeholder={t('vehicles.descriptionPlaceholder')}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={300}
        />
        <Field label={`${t('vehicles.modelYear')} (${t('common.optional')})`} value={year} onChangeText={(v) => setYear(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={4} />
        <Button title={t('common.save')} onPress={save} loading={busy} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: 16 }}>
        <Field placeholder={t('vehicles.search')} value={query} onChangeText={setQuery} autoFocus autoCorrect={false} />
      </View>
      <FlatList
        data={models}
        keyExtractor={(m) => String(m.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListEmptyComponent={<P muted>{t('common.loading')}</P>}
        renderItem={({ item }) => (
          <Pressable onPress={() => setPicked(item)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.text, fontWeight: '600', fontSize: 15 }}>
              {item.make} {item.model} {item.variant}
            </Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {[item.body_type, item.battery_kwh_net ? `${item.battery_kwh_net} kWh` : null, item.dc_max_kw ? `${item.dc_max_kw} kW DC` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
