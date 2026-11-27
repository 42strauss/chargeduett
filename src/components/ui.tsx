import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { photoUrl } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom')[];
}) {
  const c = useTheme();
  const inner = padded ? { padding: space(4), gap: space(4) } : undefined;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: space(10) }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: c.text }}>{children}</Text>
      {sub ? <Text style={{ color: c.muted, fontSize: 15 }}>{sub}</Text> : null}
    </View>
  );
}

export function H2({ children }: { children: ReactNode }) {
  const c = useTheme();
  return <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{children}</Text>;
}

export function P({ children, muted, center, small }: { children: ReactNode; muted?: boolean; center?: boolean; small?: boolean }) {
  const c = useTheme();
  return (
    <Text style={{ color: muted ? c.muted : c.text, fontSize: small ? 13 : 15, lineHeight: small ? 18 : 21, textAlign: center ? 'center' : 'left' }}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return (
    <View style={[{ backgroundColor: c.card, borderRadius: radius.lg, padding: space(4), gap: space(3), borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }, style]}>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  const c = useTheme();
  const bg = { primary: c.primary, secondary: c.chipBg, ghost: 'transparent', danger: c.danger }[variant];
  const fg = { primary: c.primaryText, secondary: c.text, ghost: c.primary, danger: '#fff' }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingVertical: small ? 8 : 14,
        paddingHorizontal: small ? 14 : 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 20} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: c.text, fontWeight: '600' }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[
          {
            backgroundColor: c.card,
            color: c.text,
            borderColor: error ? c.danger : c.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            minHeight: props.multiline ? 96 : undefined,
            textAlignVertical: props.multiline ? 'top' : 'center',
          },
          props.style,
        ]}
      />
      {error ? <Text style={{ color: c.danger, fontSize: 13 }}>{error}</Text> : hint ? <Text style={{ color: c.muted, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'checkbox' : 'text'}
      accessibilityState={{ checked: selected }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: selected ? c.primary : c.chipBg,
      }}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? c.primaryText : c.text} /> : null}
      <Text style={{ color: selected ? c.primaryText : c.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Row({ children, gap = 8, wrap }: { children: ReactNode; gap?: number; wrap?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }}>{children}</View>;
}

export function ToggleRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ flex: 1, color: c.text, fontSize: 14, lineHeight: 20 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.primary }} />
    </View>
  );
}

export function Avatar({ path, size = 56 }: { path?: string | null; size?: number }) {
  const c = useTheme();
  const uri = photoUrl(path);
  return uri ? (
    <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.chipBg }} contentFit="cover" />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.chipBg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="person" size={size / 2} color={c.muted} />
    </View>
  );
}

export function Stars({ value, size = 16, onChange }: { value: number | null; size?: number; onChange?: (v: number) => void }) {
  const c = useTheme();
  const v = value ?? 0;
  return (
    <View style={{ flexDirection: 'row', gap: onChange ? 6 : 2 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const name: IconName = v >= i ? 'star' : v >= i - 0.5 ? 'star-half' : 'star-outline';
        return (
          <Pressable key={i} disabled={!onChange} onPress={() => onChange?.(i)} hitSlop={6} accessibilityLabel={`${i}`}>
            <Ionicons name={name} size={size} color={c.primary} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ icon, text, action }: { icon: IconName; text: string; action?: ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, flex: 1 }}>
      <Ionicons name={icon} size={56} color={c.muted} />
      <Text style={{ color: c.muted, textAlign: 'center', fontSize: 15, lineHeight: 21 }}>{text}</Text>
      {action}
    </View>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <ActivityIndicator size="large" color={c.primary} />
    </View>
  );
}
