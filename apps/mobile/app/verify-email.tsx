// 2.0 Verify email: 6-digit code emailed by the API (sent automatically at
// email sign-up; sent on open when reached from Settings/Profile).
// ?onboarding=1 → part of sign-up: "Later" skips, success continues to Swiggy connect.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, type TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { palette, space } from '@moodfood/tokens';
import { Button, Icon, Screen, Text, useTheme } from '@moodfood/ui';
import { CODE_LENGTH, CodeInput, LogoTile, TopBar } from '../src/components/v2';
import { fetchCurrentUser, sendEmailVerification, verifyEmail } from '../src/services/auth';
import { trackEvent } from '../src/utils/analytics';

const RESEND_AFTER_SEC = 30;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const isOnboarding = onboarding === '1';
  const { dark } = useTheme();
  const [email, setEmail] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(isOnboarding ? RESEND_AFTER_SEC : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef<TextInput>(null);

  const resend = async () => {
    setError('');
    try {
      const res = await sendEmailVerification();
      if (res.emailVerified) setVerified(true);
      else setCountdown(RESEND_AFTER_SEC);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code');
    }
  };

  useEffect(() => {
    void (async () => {
      const user = await fetchCurrentUser();
      setEmail(user?.email ?? null);
      if (user?.emailVerified) return setVerified(true);
      // Sign-up already emailed a code; from Settings, send one now.
      if (!isOnboarding && user?.email) await resend();
      setTimeout(() => codeRef.current?.focus(), 250);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const done = () => {
    if (isOnboarding) router.replace({ pathname: '/swiggy-connect', params: { onboarding: '1' } });
    else if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  const submit = async () => {
    if (code.length !== CODE_LENGTH) return setError(`Enter the ${CODE_LENGTH}-digit code from the email.`);
    setBusy(true);
    setError('');
    try {
      await verifyEmail(code);
      trackEvent('email_verified');
      setVerified(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not verify the code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen keyboardShouldPersistTaps="handled">
        {isOnboarding ? (
          <View style={{ paddingHorizontal: space.gutter, paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="label" tone="ink2">Step 1 of 2</Text>
            {!verified ? <Button label="Later" variant="glass" size="sm" onPress={done} style={{ height: 34, borderRadius: 17 }} /> : null}
          </View>
        ) : (
          <TopBar title="Email" />
        )}

        <View style={{ paddingHorizontal: space.page, paddingTop: 28 }}>
          <LogoTile size={84} />
          <Text variant="display36" style={{ marginTop: 24 }} accessibilityRole="header">
            {verified ? 'Email verified.' : 'Verify your email'}
          </Text>
          <Text variant="body15" tone="ink2" style={{ marginTop: 10 }}>
            {verified
              ? `${email ?? 'Your email'} is confirmed. We’ll use it if you ever need to reset your password.`
              : email
                ? `We sent a ${CODE_LENGTH}-digit code to ${email}. It expires in 15 minutes.`
                : 'Add an email address to your profile first.'}
          </Text>
        </View>

        {!verified && email ? (
          <>
            <View style={{ marginTop: 16 }}>
              <CodeInput ref={codeRef} value={code} onChange={(c) => { setCode(c); setError(''); }} />
            </View>
            <View style={{ paddingHorizontal: space.page, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="mail" size={17} tone="accText" />
                <Text variant="caption13" tone="ink2">Check spam if it’s not there</Text>
              </View>
              <Pressable disabled={countdown > 0 || busy} onPress={() => void resend()} hitSlop={10} accessibilityRole="button">
                <Text variant="caption13" tone={countdown > 0 ? 'ink2' : 'accText'}>
                  {countdown > 0 ? `Resend in 0:${String(countdown).padStart(2, '0')}` : 'Resend code'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {error ? (
          <Text variant="caption13" color={palette.danger} style={{ paddingHorizontal: space.page, marginTop: 12 }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: 24 }}>
          {verified || !email ? (
            <Button block label="Continue" onPress={done} />
          ) : (
            <Button block loading={busy} label="Verify email" onPress={() => void submit()} />
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
