// 2.0 Login: phone → 6-digit OTP (new numbers add a name inline), with
// password login and guest mode kept from v1. Success → Swiggy connect
// (skipped when already linked) → check-in.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { fontFamily, palette, space } from '@moodfood/tokens';
import { Button, Icon, OtpBox, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { LogoTile, TopBar } from '../src/components/v2';
import { continueAsGuest, login as loginWithPassword, requestOtp, verifyOtp, type AuthUser } from '../src/services/auth';
import { trackEvent } from '../src/utils/analytics';

const PHONE_RE = /^\+?[0-9\s-]{7,15}$/;
const OTP_LEN = 6;
type Step = 'phone' | 'otp' | 'password';

export default function LoginScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const otpRef = useRef<TextInput>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const afterLogin = (user?: AuthUser | null) => {
    router.replace(user?.swiggyLinked ? '/home' : { pathname: '/swiggy-connect', params: { onboarding: '1' } });
  };

  const run = async (fn: () => Promise<void>, event: string) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      setError(message);
      trackEvent(event, { error: message });
    } finally {
      setBusy(false);
    }
  };

  const validPhone = () => {
    if (PHONE_RE.test(phone.trim())) return true;
    setError('Enter a valid phone number.');
    return false;
  };

  const sendOtp = () =>
    validPhone() &&
    run(async () => {
      await requestOtp(phone.trim());
      setStep('otp');
      setOtp('');
      setCountdown(30);
      setTimeout(() => otpRef.current?.focus(), 250);
    }, 'login_otp_error');

  const verify = () => {
    if (otp.length !== OTP_LEN) return setError(`Enter the ${OTP_LEN}-digit code.`);
    if (needsName && !name.trim()) return setError('Tell us your name to create your account.');
    void run(async () => {
      try {
        const res = await verifyOtp(phone.trim(), otp, needsName ? name.trim() : undefined);
        trackEvent(res.isNew ? 'signup_otp_success' : 'login_otp_success');
        afterLogin(res.user);
      } catch (e) {
        if ((e as Error & { needsName?: boolean }).needsName) {
          setNeedsName(true);
          throw new Error('New here? Add your name and tap continue.');
        }
        throw e;
      }
    }, 'login_otp_error');
  };

  const passwordLogin = () => {
    if (!validPhone()) return;
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    void run(async () => afterLogin(await loginWithPassword(phone.trim(), password)), 'login_error');
  };

  const guest = () => {
    trackEvent('guest_continue');
    // A guest session lets signals, history and quests work; if the server is
    // unreachable the app still opens (as in v1), just unpersonalised.
    setBusy(true);
    continueAsGuest()
      .catch(() => null)
      .finally(() => {
        setBusy(false);
        router.replace('/home');
      });
  };

  const back = () => {
    if (step !== 'phone') {
      setStep('phone');
      setError('');
      setNeedsName(false);
      return;
    }
    router.canGoBack() ? router.back() : router.replace('/onboarding');
  };

  const title = step === 'otp' ? 'Check your messages' : step === 'password' ? 'Welcome back' : 'Welcome to MoodFood';
  const sub =
    step === 'otp'
      ? `We sent a ${OTP_LEN}-digit code to +91 ${phone}.`
      : step === 'password'
        ? 'Log in with your phone and password.'
        : 'Log in with your phone. Takes ten seconds.';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Screen keyboardShouldPersistTaps="handled">
        <TopBar onBack={back} />
        <View style={{ paddingHorizontal: space.page, paddingTop: 28 }}>
          <LogoTile size={84} />
          <Text variant="display36" style={{ marginTop: 24 }} accessibilityRole="header">{title}</Text>
          <Text variant="body15" tone="ink2" style={{ marginTop: 10 }}>{sub}</Text>
        </View>

        {step !== 'otp' ? (
          <>
            <Surface kind="solid" bordered radius={22} style={{ marginHorizontal: space.gutter, marginTop: 26, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text variant="bodyStrong16" style={{ fontSize: 17 }}>+91</Text>
              <View style={{ width: 1, height: 28, backgroundColor: colors.line }} />
              <TextInput
                value={phone}
                onChangeText={(t) => {
                  setPhone(t.replace(/[^0-9 +-]/g, '').slice(0, 15));
                  setError('');
                }}
                placeholder="98765 43210"
                placeholderTextColor={colors.ink2}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                accessibilityLabel="Phone number"
                returnKeyType="next"
                onSubmitEditing={step === 'phone' ? sendOtp : undefined}
                style={{ flex: 1, height: 52, color: colors.ink, fontFamily: fontFamily.bodySemibold, fontSize: 18, letterSpacing: 0.7 }}
              />
            </Surface>
            {step === 'password' ? (
              <Surface kind="solid" bordered radius={22} style={{ marginHorizontal: space.gutter, marginTop: 10, paddingHorizontal: 16, paddingVertical: 6 }}>
                <TextInput
                  value={password}
                  onChangeText={(t) => {
                    setPassword(t);
                    setError('');
                  }}
                  placeholder="Password"
                  placeholderTextColor={colors.ink2}
                  secureTextEntry
                  autoComplete="current-password"
                  accessibilityLabel="Password"
                  onSubmitEditing={passwordLogin}
                  style={{ height: 52, color: colors.ink, fontFamily: fontFamily.bodyMedium, fontSize: 16 }}
                />
              </Surface>
            ) : null}
          </>
        ) : (
          <>
            <Pressable onPress={() => otpRef.current?.focus()} accessibilityLabel="Enter verification code" style={{ marginHorizontal: space.gutter, marginTop: 26, flexDirection: 'row', gap: 8 }}>
              {Array.from({ length: OTP_LEN }, (_, k) => (
                <OtpBox key={k} digit={otp[k]} state={otp.length > k ? 'filled' : otp.length === k ? 'active' : 'empty'} />
              ))}
            </Pressable>
            {/* Real input is invisible; boxes mirror it. SMS autofill works through textContentType/autoComplete. */}
            <TextInput
              ref={otpRef}
              value={otp}
              onChangeText={(t) => {
                setOtp(t.replace(/\D/g, '').slice(0, OTP_LEN));
                setError('');
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={OTP_LEN}
              style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
            />
            <View style={{ paddingHorizontal: space.page, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="sms" size={17} tone="accText" />
                <Text variant="caption13" tone="ink2">{otp.length === OTP_LEN ? 'Code entered' : 'Waiting for the SMS…'}</Text>
              </View>
              <Pressable disabled={countdown > 0 || busy} onPress={sendOtp} hitSlop={10} accessibilityRole="button">
                <Text variant="caption13" tone={countdown > 0 ? 'ink2' : 'accText'}>
                  {countdown > 0 ? `Resend in 0:${String(countdown).padStart(2, '0')}` : 'Resend code'}
                </Text>
              </Pressable>
            </View>
            {needsName ? (
              <Surface kind="solid" bordered radius={22} style={{ marginHorizontal: space.gutter, marginTop: 16, paddingHorizontal: 16, paddingVertical: 6 }}>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                  placeholderTextColor={colors.ink2}
                  autoComplete="name"
                  textContentType="name"
                  accessibilityLabel="Your name"
                  style={{ height: 52, color: colors.ink, fontFamily: fontFamily.bodyMedium, fontSize: 16 }}
                />
              </Surface>
            ) : null}
          </>
        )}

        {error ? (
          <Text variant="caption13" color={palette.danger} style={{ paddingHorizontal: space.page, marginTop: 12 }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: space.gutter, paddingTop: 16 }}>
          <Button
            block
            loading={busy}
            label={step === 'otp' ? (needsName ? 'Create account & continue' : 'Verify & continue') : step === 'password' ? 'Log in' : 'Send OTP'}
            onPress={step === 'otp' ? verify : step === 'password' ? passwordLogin : sendOtp}
          />
        </View>

        {step !== 'otp' ? (
          <>
            <View style={{ paddingHorizontal: space.page, paddingTop: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
              <Text variant="caption12" tone="ink2">or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            </View>
            <View style={{ paddingHorizontal: space.gutter, paddingTop: 16, gap: 10 }}>
              <Button
                block
                variant="glass"
                size="md"
                label={step === 'password' ? 'Use a one-time code instead' : 'Log in with password'}
                onPress={() => {
                  setStep(step === 'password' ? 'phone' : 'password');
                  setError('');
                }}
              />
              <Button block variant="glass" size="md" label="Continue as guest" onPress={guest} />
            </View>
            <Text variant="micro12" tone="ink2" align="center" style={{ paddingHorizontal: 28, paddingTop: 22 }}>
              By continuing you agree to our Terms and Privacy Policy. Mood data stays on your account and is never sold.
            </Text>
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
