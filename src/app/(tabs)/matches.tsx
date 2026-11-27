import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Empty, Title } from '@/components/ui';
import { myMatches, subscribeMatchList } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { space, useTheme } from '@/lib/theme';
import type { MatchListItem } from '@/lib/types';

export default function Matches() {
  const c = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const [items, setItems] = useState<MatchListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await myMatches());
    } catch (e) {
      showError(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Live-Aktualisierung bei neuen Nachrichten/Matches (RLS filtert serverseitig)
  useEffect(() => {
    if (!session) return;
    return subscribeMatchList(load);
  }, [session, load]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: space(4) }}>
        <Title>{t('matches.title')}</Title>
      </View>
      <FlatList
        data={items}
        keyExtractor={(m) => m.match_id}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space(4), gap: 4 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.primary}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={<Empty icon="chatbubbles-outline" text={t('matches.empty')} />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: item.match_id } })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
          >
            <Avatar path={item.partner_photo} size={60} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>
                  {item.partner_name}, {item.partner_age}
                </Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>· {t(`modes.${item.mode}`)}</Text>
              </View>
              <Text style={{ color: item.unread ? c.text : c.muted, fontWeight: item.unread ? '700' : '400' }} numberOfLines={1}>
                {item.last_message ? `${item.last_message_mine ? t('matches.you') : ''}${item.last_message}` : t('matches.newMatch')}
              </Text>
            </View>
            {item.unread > 0 ? (
              <View style={{ backgroundColor: c.primary, borderRadius: 12, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                <Text style={{ color: c.primaryText, fontWeight: '800', fontSize: 12 }}>{item.unread}</Text>
              </View>
            ) : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
