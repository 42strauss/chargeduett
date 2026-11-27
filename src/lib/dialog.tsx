/**
 * Plattformneutrale Dialoge. Auf iOS/Android → natives Alert.
 * Im Web (react-native-web kennt kein Alert, Artefakte blockieren confirm())
 * → eigener In-App-Dialog über <DialogHost/>.
 */
import { useEffect, useState } from 'react';
import { Alert as RNAlert, Modal, Platform, Pressable, Text, View, type AlertButton } from 'react-native';
import { radius, useTheme } from './theme';

type Req = { title: string; message?: string; buttons: AlertButton[] };
let push: ((r: Req) => void) | null = null;
const queue: Req[] = [];

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web') return RNAlert.alert(title, message, buttons);
    const req = { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] };
    if (push) push(req);
    else queue.push(req);
  },
};

export function DialogHost() {
  const c = useTheme();
  const [items, setItems] = useState<Req[]>([]);
  useEffect(() => {
    push = (r) => setItems((cur) => [...cur, r]);
    if (queue.length) setItems(queue.splice(0));
    return () => {
      push = null;
    };
  }, []);
  const cur = items[0];
  if (!cur) return null;
  const close = (b?: AlertButton) => {
    setItems((x) => x.slice(1));
    b?.onPress?.();
  };
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => close(cur.buttons.find((b) => b.style === 'cancel'))}>
      <View style={{ flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: c.card, borderRadius: radius.lg, padding: 20, gap: 12, width: '100%', maxWidth: 380, borderWidth: 1, borderColor: c.border }}>
          {cur.title ? <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>{cur.title}</Text> : null}
          {cur.message ? <Text style={{ color: c.text, fontSize: 15, lineHeight: 21 }}>{cur.message}</Text> : null}
          <View style={{ gap: 8, marginTop: 4 }}>
            {cur.buttons.map((b, i) => (
              <Pressable
                key={i}
                onPress={() => close(b)}
                accessibilityRole="button"
                style={{
                  paddingVertical: 12,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  backgroundColor: b.style === 'destructive' ? c.danger : b.style === 'cancel' ? c.chipBg : c.primary,
                }}
              >
                <Text style={{ fontWeight: '700', color: b.style === 'destructive' ? '#fff' : b.style === 'cancel' ? c.text : c.primaryText }}>{b.text}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}
