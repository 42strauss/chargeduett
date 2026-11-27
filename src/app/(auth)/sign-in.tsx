import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { Alert } from '@/lib/dialog';
import { PodcastBadge } from '@/components/PodcastBadge';
import { Button, Field, P, Screen } from '@/components/ui';
import { appleAvailable, signInDemoPreset, signInWithApple, signInWithEmail, signInWithGoogle, signUpWithEmail } from '@/lib/auth';
import { DEMO } from '@/lib/config';
import { t } from '@/lib/i18n';
import { isConfigured } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function SignIn() {
  const c = useTheme();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) Alert.alert(t('common.error'), msg);
    } finally {
      setBusy(null);
    }
  };

  const submit = () =>
    run('email', async () => {
      if (mode === 'signIn') await signInWithEmail(email, password);
      else if (await signUpWithEmail(email, password)) Alert.alert(t('auth.signUp'), t('auth.checkMail'));
    });

  const valid = /\S+@\S+\.\S+/.test(email) && password.length >= 8;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 8, marginTop: 40, marginBottom: 16 }}>
          <View style={{ width: 88, height: 88, borderRadius: 26, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="flash" size={52} color={c.primaryText} />
          </View>
          <Text style={{ fontSize: 40, fontWeight: '900', color: c.text, letterSpacing: -1 }}>{t('brand.appName')}</Text>
          <P muted center>{t('auth.tagline')}</P>
          <View style={{ marginTop: 12 }}>
            <PodcastBadge />
          </View>
        </View>

        {DEMO ? (
          <View style={{ gap: 12, borderWidth: 1, borderColor: c.primary, borderRadius: 16, padding: 14 }}>
            <P small>{t('demo.banner')}</P>
            <Button title={t('demo.preset')} icon="flash" onPress={() => run('preset', signInDemoPreset)} loading={busy === 'preset'} />
          </View>
        ) : !isConfigured ? (
          <P center>⚠️ {t('auth.notConfigured')}</P>
        ) : null}

        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={999}
            style={{ height: 50 }}
            onPress={() => run('apple', signInWithApple)}
          />
        ) : null}
        <Button title={t('auth.google')} icon="logo-google" variant="secondary" onPress={() => run('google', signInWithGoogle)} loading={busy === 'google'} />

        <P muted center>— {t('auth.or')} —</P>

        <Field placeholder={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field
          placeholder={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          onSubmitEditing={valid ? submit : undefined}
        />
        <Button title={mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')} onPress={submit} disabled={!valid} loading={busy === 'email'} />
        <Button
          variant="ghost"
          title={mode === 'signIn' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
          onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        />
        <P muted small center>{t('auth.legal')}</P>
      </KeyboardAvoidingView>
    </Screen>
  );
}
