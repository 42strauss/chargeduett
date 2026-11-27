import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ReportSheet } from '@/components/ReportSheet';
import { Avatar, Button, Card, H2, P, Row } from '@/components/ui';
import { blockUser, loadMessages, markRead, matchPartner, sendMessage, subscribeMessages, unmatch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { showError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { photoUrl } from '@/lib/supabase';
import { radius, useTheme } from '@/lib/theme';
import type { MatchPartner, Message } from '@/lib/types';

export default function Chat() {
  const c = useTheme();
  const router = useRouter();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { session } = useAuth();
  const me = session?.user.id;
  const [partner, setPartner] = useState<MatchPartner | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const list = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([matchPartner(matchId), loadMessages(matchId)]);
      if (!p) {
        router.back(); // Match gelöst oder blockiert
        return;
      }
      setPartner(p);
      setMessages(m);
      markRead(matchId);
    } catch (e) {
      showError(e);
    }
  }, [matchId, router]);

  useEffect(() => {
    load();
    return subscribeMessages(matchId, (msg) => {
      setMessages((cur) => (cur.some((x) => x.id === msg.id) ? cur.map((x) => (x.id === msg.id ? msg : x)) : [...cur, msg]));
      if (msg.sender_id !== me) {
        markRead(matchId);
        // Eigene Nachrichten als gelesen markieren (Partner hat geantwortet)
        setMessages((cur) => cur.map((x) => (x.sender_id === me && !x.read_at ? { ...x, read_at: msg.created_at } : x)));
      }
    });
  }, [matchId, me, load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setSending(true);
    try {
      const msg = await sendMessage(matchId, body);
      setText('');
      setMessages((cur) => (cur.some((x) => x.id === msg.id) ? cur : [...cur, msg]));
    } catch (e) {
      showError(e);
    } finally {
      setSending(false);
    }
  };

  const confirm = (msg: string, fn: () => Promise<void>) =>
    Alert.alert('', msg, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.ok'),
        style: 'destructive',
        onPress: async () => {
          try {
            await fn();
            router.back();
          } catch (e) {
            showError(e);
          }
        },
      },
    ]);

  const openMenu = () => {
    if (!partner) return;
    const actions = [
      { label: t('chat.profile'), run: () => setProfileOpen(true) },
      { label: t('chat.unmatch'), run: () => confirm(t('chat.unmatchConfirm'), () => unmatch(matchId)) },
      { label: t('chat.block'), run: () => confirm(t('chat.blockConfirm'), () => blockUser(partner.user_id)) },
      { label: t('chat.report'), run: () => setReportOpen(true) },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...actions.map((a) => a.label), t('common.cancel')], cancelButtonIndex: actions.length, destructiveButtonIndex: [2, 3] },
        (i) => actions[i]?.run(),
      );
    } else {
      Alert.alert(partner.display_name, undefined, [...actions.map((a) => ({ text: a.label, onPress: a.run })), { text: t('common.cancel'), style: 'cancel' as const }]);
    }
  };

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={() => setProfileOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Avatar path={partner?.photos[0]} size={32} />
              <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{partner?.display_name ?? ''}</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={openMenu} hitSlop={10} accessibilityLabel="Menü">
              <Ionicons name="ellipsis-horizontal" size={24} color={c.text} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 16, gap: 6, flexGrow: 1, justifyContent: 'flex-end' }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            <View style={{ backgroundColor: c.chipBg, borderRadius: radius.md, padding: 12, marginBottom: 12 }}>
              <P small muted>🛡️ {t('chat.safety')}</P>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === me;
            return (
              <Pressable
                onLongPress={() => !mine && setReportOpen(true)}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  backgroundColor: mine ? c.primary : c.card,
                  borderRadius: 18,
                  borderBottomRightRadius: mine ? 4 : 18,
                  borderBottomLeftRadius: mine ? 18 : 4,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                }}
              >
                <Text style={{ color: mine ? c.primaryText : c.text, fontSize: 15 }}>{item.body}</Text>
                <Text style={{ color: mine ? c.primaryText : c.muted, fontSize: 10, opacity: 0.7, alignSelf: 'flex-end', marginTop: 2 }}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {mine && item.read_at ? ' ✓✓' : ''}
                </Text>
              </Pressable>
            );
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: c.border, alignItems: 'flex-end' }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={c.muted}
            multiline
            maxLength={2000}
            style={{ flex: 1, backgroundColor: c.card, color: c.text, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120 }}
          />
          <Pressable
            onPress={send}
            disabled={sending || !text.trim()}
            accessibilityLabel={t('chat.send')}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: text.trim() ? c.primary : c.chipBg, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="send" size={18} color={text.trim() ? c.primaryText : c.muted} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {partner ? (
        <ReportSheet userId={partner.user_id} visible={reportOpen} onClose={() => setReportOpen(false)} onDone={() => { setReportOpen(false); router.back(); }} />
      ) : null}

      <Modal visible={profileOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setProfileOpen(false)}>
        {partner ? (
          <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16 }}>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ borderRadius: radius.lg }}>
              {partner.photos.map((p) => (
                <Image key={p} source={{ uri: photoUrl(p) }} style={{ width: 340, height: 440, borderRadius: radius.lg, marginRight: 8 }} contentFit="cover" />
              ))}
            </ScrollView>
            <H2>
              {partner.display_name}, {partner.age}
            </H2>
            {partner.occupation ? <P muted>{partner.occupation}</P> : null}
            {partner.bio ? <P>{partner.bio}</P> : null}
            {partner.vehicles.map((v, i) => (
              <Card key={i}>
                <Row>
                  <Ionicons name="car-sport" size={20} color={c.primary} />
                  <Text style={{ color: c.text, fontWeight: '700' }}>
                    {v.make} {v.model} {v.variant}
                    {v.nickname ? ` „${v.nickname}“` : ''}
                  </Text>
                </Row>
                {v.description ? <P muted small>{v.description}</P> : null}
              </Card>
            ))}
            <Button title={t('common.done')} variant="secondary" onPress={() => setProfileOpen(false)} />
          </ScrollView>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}
