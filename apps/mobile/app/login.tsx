// 2.0 Login: email + password (log in, create an account, or reset a
// forgotten password with an emailed code) is the default. Phone stays
// available: password login always, the 6-digit OTP flow only when the server
// reports it can send SMS (/auth/methods). Guest mode kept from v1.
// Success → (new email accounts: verify email) → Swiggy connect (skipped when
// already linked) → check-in.
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { fontFamily, palette, space } from '@moodfood/tokens';
import { Button, Icon, Screen, Surface, Text, useTheme } from '@moodfood/ui';
import { CODE_LENGTH, CodeInput, LogoTile, PoweredBySwiggy, TopBar } from '../src/components/v2';
import {
  continueAsGuest,
  fetchAuthMethods,
  forgotPassword,
  login as loginWithPassword,
  requestOtp,
  resetPasswordWithEmail,
  signup,
  verifyOtp,
  type AuthUser,
} from '../src/services/auth';
import { trackEvent } from '../src/utils/analytics';

const PHONE_RE = /^\+?[0-9\s-]{7,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LEN = CODE_LENGTH;
const MIN_PASSWORD = 6;
type Method = 'email' | 'phone';
type EmailMode = 'login' | 'signup' | 'forgot' | 'reset';
type PhoneStep = 'phone' | 'otp' | 'password';

/** One rounded input row; matches the phone field's surface. */
function Field(props: TextInputProps) {
  const { colors } = useTheme();
  return (
    <Surface kind="solid" bordered radius={22} style={{ marginHorizontal: space.gutter, marginTop: 10, paddingHorizontal: 16, paddingVertical: 6 }}>
      <TextInput
        placeholderTextColor={colors.ink2}
        {...props}
        style={{ height: 52, color: colors.ink, fontFamily: fontFamily.bodyMedium, fontSize: 16 }}
      />
    </Surface>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { colors, dark } = useTheme();
  const [method, setMethod] = useState<Method>('email');
  const [emailMode, setEmailMode] = useState<EmailMode>('login');
  const [step, setStep] = useState<PhoneStep>('password');
  const [otpAvailable, setOtpAvailable] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [needsName, setNeedsName] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const otpRef = useRef<TextInput>(null);

  useEffect(() => {
    void fetchAuthMethods().then((m) => setOtpAvailable(m.otp));
  }, []);

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

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setError('');
  };

  /* ── Email ── */

  const setMode = (mode: EmailMode) => {
    setEmailMode(mode);
    setError('');
    setNotice('');
  };

  const sendResetCode = () =>
    void run(async () => {
      await forgotPassword(email.trim());
      setMode('reset');
      setOtp('');
      setPassword('');
      setCountdown(30);
      setNotice(`If ${email.trim()} has an account, a 6-digit code is on its way.`);
      setTimeout(() => otpRef.current?.focus(), 250);
    }, 'forgot_password_error');

  const emailSubmit = () => {
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (emailMode === 'forgot') return sendResetCode();
    if (emailMode === 'reset' && otp.length !== OTP_LEN) return setError(`Enter the ${OTP_LEN}-digit code from the email.`);
    if (emailMode === 'signup' && !name.trim()) return setError('Tell us your name.');
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    void run(async () => {
      const account = { email: email.trim() };
      if (emailMode === 'signup') {
        await signup(name.trim(), account, password);
        trackEvent('signup_email_success');
        // A code was emailed at sign-up; verify, then carry on to Swiggy connect.
        router.replace({ pathname: '/verify-email', params: { onboarding: '1' } });
        return;
      }
      const user = emailMode === 'reset' ? await resetPasswordWithEmail(account.email, otp, password) : await loginWithPassword(account, password);
      trackEvent(emailMode === 'reset' ? 'password_reset_success' : 'login_email_success');
      afterLogin(user);
    }, `${emailMode}_email_error`);
  };

  /* ── Phone ── */

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

  const phonePasswordLogin = () => {
    if (!validPhone()) return;
    if (password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters.`);
    void run(async () => afterLogin(await loginWithPassword({ phone: phone.trim() }, password)), 'login_error');
  };

  /* ── Navigation ── */

  const switchMethod = (next: Method) => {
    setMethod(next);
    setStep(next === 'phone' && otpAvailable ? 'phone' : 'password');
    setNeedsName(false);
    setError('');
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
    if (method === 'phone' && step === 'otp') {
      setStep('phone');
      setError('');
      setNeedsName(false);
      return;
    }
    if (method === 'phone') return switchMethod('email');
    if (emailMode === 'forgot' || emailMode === 'reset') return setMode('login');
    router.canGoBack() ? router.back() : router.replace('/onboarding');
  };

  const isEmail = method === 'email';
  const signingUp = isEmail && emailMode === 'signup';
  const recovering = isEmail && (emailMode === 'forgot' || emailMode === 'reset');
  const EMAIL_COPY: Record<EmailMode, { title: string; sub: string; cta: string }> = {
    login: { title: 'Welcome to MoodFood', sub: 'Log in with your email and password.', cta: 'Log in' },
    signup: { title: 'Create your account', sub: 'Your name, email and a password. That’s it.', cta: 'Create account' },
    forgot: { title: 'Forgot your password?', sub: 'We’ll email you a 6-digit code to reset it.', cta: 'Send reset code' },
    reset: { title: 'Check your email', sub: 'Enter the code we sent and choose a new password.', cta: 'Reset password & log in' },
  };
  const title = isEmail ? EMAIL_COPY[emailMode].title : step === 'otp' ? 'Check your messages' : 'Log in with phone';
  const sub = isEmail
    ? EMAIL_COPY[emailMode].sub
    : step === 'otp'
      ? `We sent a ${OTP_LEN}-digit code to +91 ${phone}.`
      : step === 'password' ? 'Use the phone number and password on your account.' : 'We’ll text you a one-time code.';
  const primaryLabel = isEmail
    ? EMAIL_COPY[emailMode].cta
    : step === 'otp' ? (needsName ? 'Create account & continue' : 'Verify & continue') : step === 'password' ? 'Log in' : 'Send OTP';
  const primaryAction = isEmail ? emailSubmit : step === 'otp' ? verify : step === 'password' ? phonePasswordLogin : sendOtp;

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

        <View style={{ marginTop: 16 }}>
          {isEmail ? (
            <>
              {signingUp ? (
                <Field value={name} onChangeText={edit(setName)} placeholder="Your name" autoComplete="name" textContentType="name" accessibilityLabel="Your name" returnKeyType="next" />
              ) : null}
              {emailMode === 'reset' ? (
                <CodeInput ref={otpRef} value={otp} onChange={edit(setOtp)} />
              ) : (
                <Field
                  value={email}
                  onChangeText={edit(setEmail)}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType={signingUp ? 'emailAddress' : 'username'}
                  accessibilityLabel="Email"
                  returnKeyType={emailMode === 'forgot' ? 'send' : 'next'}
                  onSubmitEditing={emailMode === 'forgot' ? emailSubmit : undefined}
                />
              )}
              {emailMode !== 'forgot' ? (
                <Field
                  value={password}
                  onChangeText={edit(setPassword)}
                  placeholder={emailMode === 'login' ? 'Password' : `${emailMode === 'reset' ? 'New password' : 'Password'} (${MIN_PASSWORD}+ characters)`}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={emailMode === 'login' ? 'current-password' : 'new-password'}
                  textContentType={emailMode === 'login' ? 'password' : 'newPassword'}
                  accessibilityLabel={emailMode === 'reset' ? 'New password' : 'Password'}
                  onSubmitEditing={emailSubmit}
                />
              ) : null}
              {emailMode === 'reset' ? (
                <View style={{ paddingHorizontal: space.page, paddingTop: 12, flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <Pressable disabled={countdown > 0 || busy} onPress={sendResetCode} hitSlop={10} accessibilityRole="button">
                    <Text variant="caption13" tone={countdown > 0 ? 'ink2' : 'accText'}>
                      {countdown > 0 ? `Resend in 0:${String(countdown).padStart(2, '0')}` : 'Resend code'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          ) : step !== 'otp' ? (
            <>
              <Surface kind="solid" bordered radius={22} style={{ marginHorizontal: space.gutter, marginTop: 10, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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
                <Field
                  value={password}
                  onChangeText={edit(setPassword)}
                  placeholder="Password"
                  secureTextEntry
                  autoComplete="current-password"
                  accessibilityLabel="Password"
                  onSubmitEditing={phonePasswordLogin}
                />
              ) : null}
            </>
          ) : (
            <>
              <CodeInput ref={otpRef} value={otp} onChange={edit(setOtp)} sms />
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
                <Field value={name} onChangeText={setName} placeholder="Your name" autoComplete="name" textContentType="name" accessibilityLabel="Your name" />
              ) : null}
            </>
          )}
        </View>

        {notice && !error ? (
          <Text variant="caption13" tone="ink2" style={{ paddingHorizontal: space.page, marginTop: 12 }} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
        {error ? (
          <Text variant="caption13" color={palette.danger} style={{ paddingHorizontal: space.page, marginTop: 12 }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <View style={{ paddingHorizontal: space.gutter, paddingTop: 16, gap: 6 }}>
          <Button block loading={busy} label={primaryLabel} onPress={primaryAction} />
          {isEmail && emailMode === 'login' ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Button variant="ghost" size="sm" label="Forgot password?" onPress={() => setMode('forgot')} />
              <Button variant="ghost" size="sm" label="Create an account" onPress={() => setMode('signup')} />
            </View>
          ) : isEmail ? (
            <Button block variant="ghost" size="sm" label={signingUp ? 'Already have an account? Log in' : 'Back to log in'} onPress={() => setMode('login')} />
          ) : null}
        </View>

        {(isEmail ? !recovering : step !== 'otp') ? (
          <>
            <View style={{ paddingHorizontal: space.page, paddingTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
              <Text variant="caption12" tone="ink2">or</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
            </View>
            <View style={{ paddingHorizontal: space.gutter, paddingTop: 16, gap: 10 }}>
              {isEmail ? (
                <Button block variant="glass" size="md" iconLeft="call" label="Use phone number instead" onPress={() => switchMethod('phone')} />
              ) : (
                <>
                  {otpAvailable ? (
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
                  ) : null}
                  <Button block variant="glass" size="md" iconLeft="mail" label="Use email instead" onPress={() => switchMethod('email')} />
                </>
              )}
              <Button block variant="glass" size="md" label="Continue as guest" onPress={guest} />
            </View>
            <Text variant="micro12" tone="ink2" align="center" style={{ paddingHorizontal: 28, paddingTop: 22 }}>
              By continuing you agree to our Terms and Privacy Policy. Mood data stays on your account and is never sold.
            </Text>
            <PoweredBySwiggy style={{ paddingTop: 18, paddingBottom: 24 }} />
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
