import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { getMyProfile } from './api';
import { DEMO } from './config';
import { demoAuth } from './demo/api.demo';
import { loadPresetProfile } from './demo/store';
import { setLocale } from './i18n';
import { supabase } from './supabase';
import type { Profile } from './types';

WebBrowser.maybeCompleteAuthSession();

// Im Demo-Modus ersetzt eine lokale Anmeldung Supabase Auth (gleiche Teil-Schnittstelle).
const authClient = (DEMO ? demoAuth : supabase.auth) as unknown as typeof supabase.auth;

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  setProfile: (p: Profile | null) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const setProfile = useCallback((p: Profile | null) => {
    setProfileState(p);
    if (p?.locale) setLocale(p.locale);
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await getMyProfile());
    } catch {
      setProfile(null);
    }
  }, [setProfile]);

  useEffect(() => {
    authClient.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) await refreshProfile();
      setLoading(false);
    });
    const { data: sub } = authClient.onAuthStateChange(async (event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setLoading(true);
        await refreshProfile();
        setLoading(false);
      }
      if (event === 'SIGNED_OUT') setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [refreshProfile, setProfile]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, refreshProfile, setProfile, signOut }),
    [session, profile, loading, refreshProfile, setProfile, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth außerhalb von AuthProvider');
  return v;
}

// ---------------------------------------------------------------- Anmeldewege

export async function signInWithEmail(email: string, password: string) {
  const { error } = await authClient.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Gibt true zurück, wenn eine Bestätigungs-Mail nötig ist. */
export async function signUpWithEmail(email: string, password: string): Promise<boolean> {
  const { data, error } = await authClient.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: Linking.createURL('/') },
  });
  if (error) throw error;
  return !data.session;
}

export const appleAvailable = Platform.OS === 'ios';

export async function signInWithApple() {
  if (DEMO) return signInDemoPreset();
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
  });
  if (!credential.identityToken) throw new Error('Apple hat kein Token geliefert');
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
  if (error) throw error;
}

/** Google-Login über Supabase OAuth (PKCE) im System-Browser. */
export async function signInWithGoogle() {
  if (DEMO) return signInDemoPreset();
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (Platform.OS === 'web') {
    window.location.href = data.url;
    return;
  }
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return;
  const code = new URL(res.url).searchParams.get('code');
  if (!code) throw new Error('Kein Code im Redirect');
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;
}

/** Demo: direkt mit fertigem Profil "Max" einsteigen. */
export async function signInDemoPreset() {
  loadPresetProfile();
  await authClient.signInWithPassword({ email: 'max@demo.chargeduett', password: 'demo' });
}
