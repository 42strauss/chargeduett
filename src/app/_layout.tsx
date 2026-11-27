import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Loading } from '@/components/ui';
import { initAds } from '@/lib/ads';
import { DialogHost } from '@/lib/dialog';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ChargingProvider, useCharging } from '@/lib/charging';
import { enablePush } from '@/lib/push';
import { usePushRouting } from '@/lib/usePushRouting';
import { t } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';

/** Leitet je nach Zustand weiter: nicht angemeldet → Login, ohne Profil → Onboarding, sonst → App. */
function Gate() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const c = useTheme();

  useEffect(() => {
    if (loading) return;
    const first = segments[0] as string | undefined;
    const inAuth = first === '(auth)';
    const inOnboarding = first === 'onboarding';
    if (!session) {
      if (!inAuth) router.replace('/sign-in');
    } else if (!profile) {
      if (!inOnboarding) router.replace('/onboarding');
    } else if (inAuth || inOnboarding) {
      router.replace('/');
    }
  }, [session, profile, loading, segments, router]);

  useEffect(() => {
    if (profile) initAds();
  }, [profile]);

  // Gerät still neu registrieren, falls die Erlaubnis schon erteilt wurde (Token können sich ändern)
  const signedInWithProfile = Boolean(session && profile);
  useEffect(() => {
    if (signedInWithProfile) enablePush(false).catch(() => undefined);
  }, [signedInWithProfile]);
  const { refresh: refreshCharging } = useCharging();
  usePushRouting(signedInWithProfile, refreshCharging);

  if (loading) return <Loading />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg },
        headerBackTitle: t('common.back'),
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="chat/[matchId]" options={{ title: '' }} />
      <Stack.Screen name="vehicle/add" options={{ title: t('vehicles.add'), presentation: 'modal' }} />
      <Stack.Screen name="vehicle/[modelId]" options={{ title: '' }} />
      <Stack.Screen name="settings/edit-profile" options={{ title: t('profile.edit') }} />
      <Stack.Screen name="settings/privacy" options={{ title: t('privacy.title') }} />
      <Stack.Screen name="settings/notifications" options={{ title: t('push.settingsTitle') }} />
      <Stack.Screen name="settings/imprint" options={{ title: t('profile.imprint') }} />
      <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const c = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.bg }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ChargingProvider>
            <StatusBar style="light" />
            <Gate />
            <DialogHost />
          </ChargingProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
