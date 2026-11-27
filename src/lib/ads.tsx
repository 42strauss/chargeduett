/**
 * Werbung über Google AdMob.
 *
 * - In Expo Go und im Web gibt es das native Modul nicht → Platzhalter.
 *   Echte Anzeigen erscheinen nur in einem Development/Production-Build.
 * - EU/DSGVO: Vor dem ersten Laden wird Googles Consent-Dialog (UMP/TCF) gezeigt.
 *   Ohne Zustimmung werden nur nicht-personalisierte Anzeigen angefragt.
 * - Ohne eigene Anzeigenblock-IDs (.env) werden Googles Test-Anzeigen genutzt.
 */
import { Platform, Text, View } from 'react-native';
import { t } from './i18n';
import { radius, useTheme } from './theme';

type AdsModule = typeof import('react-native-google-mobile-ads');

let mod: AdsModule | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    mod = null; // Expo Go
  }
}

let personalized = false;
let ready = false;

export async function initAds() {
  if (!mod || ready) return;
  try {
    const info = await mod.AdsConsent.gatherConsent();
    if (!info.canRequestAds) return;
    const choices = await mod.AdsConsent.getUserChoices().catch(() => null);
    personalized = Boolean(choices?.selectPersonalisedAds);
    await mod.default().initialize();
    ready = true;
  } catch (e) {
    if (__DEV__) console.warn('AdMob nicht verfügbar', e);
  }
}

/** Öffnet die Datenschutzoptionen von Google (Widerruf der Werbe-Einwilligung). */
export async function showAdPrivacyOptions() {
  if (!mod) return;
  try {
    await mod.AdsConsent.showPrivacyOptionsForm();
  } catch {
    /* nicht erforderlich in dieser Region */
  }
}

function unitId(kind: 'banner' | 'rect'): string | null {
  if (!mod) return null;
  const env =
    kind === 'banner'
      ? Platform.select({ ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS, android: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID })
      : Platform.select({ ios: process.env.EXPO_PUBLIC_ADMOB_RECT_IOS, android: process.env.EXPO_PUBLIC_ADMOB_RECT_ANDROID });
  if (__DEV__ || !env) return kind === 'banner' ? mod.TestIds.ADAPTIVE_BANNER : mod.TestIds.BANNER;
  return env;
}

function Placeholder({ height, label }: { height: number; label: string }) {
  const c = useTheme();
  return (
    <View
      style={{
        height,
        alignSelf: 'stretch',
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

/** Schmales Banner (z. B. unter dem Fahrzeug-Ranking). */
export function AdBanner() {
  const id = unitId('banner');
  if (!mod || !id) return <Placeholder height={56} label={`${t('discover.sponsored')} · Banner`} />;
  const { BannerAd, BannerAdSize } = mod;
  return (
    <View style={{ alignItems: 'center' }}>
      <BannerAd
        unitId={id}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: !personalized }}
      />
    </View>
  );
}

/** Großes Rechteck (300×250) für die Werbekarte im Swipe-Stapel. */
export function AdRectangle() {
  const id = unitId('rect');
  if (!mod || !id) return <Placeholder height={250} label={`${t('discover.sponsored')} · 300×250`} />;
  const { BannerAd, BannerAdSize } = mod;
  return (
    <BannerAd
      unitId={id}
      size={BannerAdSize.MEDIUM_RECTANGLE}
      requestOptions={{ requestNonPersonalizedAdsOnly: !personalized }}
    />
  );
}
