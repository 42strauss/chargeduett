/**
 * Swipe-Stapel mit Bordmitteln (Animated + PanResponder), damit er auch in
 * Expo Go und im Web ohne zusätzliche native Module läuft.
 * Rechts = Verbinden, links = Weiter. Werbekarten werden übersprungen,
 * egal in welche Richtung geswiped wird.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

const THRESHOLD = 0.28; // Anteil der Bildschirmbreite

export function SwipeDeck<T>({
  items,
  keyOf,
  renderItem,
  onSwipe,
  disabledFor,
}: {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onSwipe: (item: T, dir: 'like' | 'pass') => void;
  /** z. B. Werbekarten: kein Like/Pass-Overlay */
  disabledFor?: (item: T) => boolean;
}) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const pos = useRef(new Animated.ValueXY()).current;
  const top = items[0];
  const topRef = useRef(top);
  topRef.current = top;

  useEffect(() => {
    pos.setValue({ x: 0, y: 0 });
  }, [top, pos]);

  const fling = (dir: 'like' | 'pass') => {
    const item = topRef.current;
    if (item === undefined) return;
    Animated.timing(pos, {
      toValue: { x: (dir === 'like' ? 1.5 : -1.5) * width, y: 40 },
      duration: 220,
      useNativeDriver: false,
    }).start(() => onSwipe(item, dir));
  };
  const flingRef = useRef(fling);
  flingRef.current = fling;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          if (g.dx > width * THRESHOLD || g.vx > 1.2) flingRef.current('like');
          else if (g.dx < -width * THRESHOLD || g.vx < -1.2) flingRef.current('pass');
          else Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();
        },
      }),
    [pos, width],
  );

  const rotate = pos.x.interpolate({ inputRange: [-width, 0, width], outputRange: ['-12deg', '0deg', '12deg'] });
  const likeOpacity = pos.x.interpolate({ inputRange: [0, width * THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = pos.x.interpolate({ inputRange: [-width * THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const nextScale = pos.x.interpolate({ inputRange: [-width, 0, width], outputRange: [1, 0.95, 1], extrapolate: 'clamp' });

  if (top === undefined) return null;
  const noOverlay = disabledFor?.(top);

  return (
    <View style={{ flex: 1, gap: 16 }}>
      <View style={{ flex: 1 }}>
        {items[1] !== undefined ? (
          <Animated.View key={keyOf(items[1])} style={{ position: 'absolute', inset: 0, transform: [{ scale: nextScale }] }}>
            {renderItem(items[1])}
          </Animated.View>
        ) : null}
        <Animated.View
          key={keyOf(top)}
          {...responder.panHandlers}
          style={{ position: 'absolute', inset: 0, transform: [{ translateX: pos.x }, { translateY: pos.y }, { rotate }] }}
        >
          {renderItem(top)}
          {!noOverlay ? (
            <>
              <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 36, left: 24, opacity: likeOpacity, transform: [{ rotate: '-14deg' }] }}>
                <Stamp text={t('discover.like')} color={c.like} />
              </Animated.View>
              <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 36, right: 24, opacity: passOpacity, transform: [{ rotate: '14deg' }] }}>
                <Stamp text={t('discover.pass')} color={c.pass} />
              </Animated.View>
            </>
          ) : null}
        </Animated.View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 40 }}>
        <RoundButton icon="close" color={c.pass} label={t('discover.pass')} onPress={() => fling('pass')} />
        <RoundButton icon={noOverlay ? 'arrow-forward' : 'flash'} color={c.like} label={noOverlay ? t('common.next') : t('discover.like')} onPress={() => fling('like')} big />
      </View>
    </View>
  );
}

function Stamp({ text, color }: { text: string; color: string }) {
  return (
    <View style={{ borderWidth: 4, borderColor: color, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.15)' }}>
      <Text style={{ color, fontSize: 30, fontWeight: '900', textTransform: 'uppercase' }}>{text}</Text>
    </View>
  );
}

function RoundButton({ icon, color, label, onPress, big }: { icon: 'close' | 'flash' | 'arrow-forward'; color: string; label: string; onPress: () => void; big?: boolean }) {
  const c = useTheme();
  const size = big ? 72 : 60;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.card,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: color,
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}
    >
      <Ionicons name={icon} size={big ? 34 : 28} color={color} />
    </Pressable>
  );
}
