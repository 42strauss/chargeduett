import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

// Schriftzug des Podcasts. Für das Original-Logo einfach diese Datei ersetzen
// (transparentes PNG, Seitenverhältnis ca. 5:4).
const LOGO = require('../../assets/brand/auto-duett.png');

/** "Ein Service vom Podcast" + Auto-Duett-Schriftzug */
export function PodcastBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const c = useTheme();
  const w = size === 'sm' ? 50 : 72; // bewusst klein: Hinweis, nicht Hauptmarke
  return (
    <View style={{ alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${t('brand.serviceOf')} Auto Duett`}>
      <Text style={{ color: c.muted, fontSize: size === 'sm' ? 11 : 13, letterSpacing: 0.5 }}>{t('brand.serviceOf')}</Text>
      <Image source={LOGO} style={{ width: w, height: w * 0.795 }} contentFit="contain" />
    </View>
  );
}
