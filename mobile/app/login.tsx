import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Phone, Lock, MessageSquare, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { fw, colors } from '../src/constants/theme';
import Screen from '../src/components/Screen';
import GradientButton from '../src/components/GradientButton';
import AuthTextField from '../src/components/AuthTextField';
import { fadeUp } from '../src/utils/animations';
import { trackEvent } from '../src/utils/analytics';
import { login as loginWithPassword, requestOtp, verifyOtp } from '../src/services/auth';

const PHONE_RE = /^\+?[0-9\s-]{7,15}$/;

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [mode, setMode] = useState<'password' | 'otp'>('password');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [errors, setErrors] = useState<{ phone?: string; password?: string; otp?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    fadeUp(opacity, translateY);
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const switchMode = (next: 'password' | 'otp') => {
    setMode(next);
    setErrors({});
    setApiError('');
    setOtpSent(false);
    setOtp('');
    setCountdown(0);
  };

  const validatePhone = () => {
    if (!PHONE_RE.test(phone.trim())) {
      setErrors((e) => ({ ...e, phone: 'Enter a valid phone number.' }));
      return false;
    }
    return true;
  };

  const handlePasswordLogin = async () => {
    const next: typeof errors = {};
    if (!PHONE_RE.test(phone.trim())) next.phone = 'Enter a valid phone number.';
    if (password.length < 6) next.password = 'Password must be at least 6 characters.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setApiError('');
    setSubmitting(true);
    trackEvent('login_submitted');
    try {
      await loginWithPassword(phone, password);
      router.replace('/home');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setApiError(message);
      trackEvent('login_error', { error: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendOtp = async () => {
    if (!validatePhone()) return;

    setApiError('');
    setSubmitting(true);
    trackEvent('login_otp_requested');
    try {
      await requestOtp(phone);
      setOtpSent(true);
      setOtp('');
      setCountdown(30);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send OTP';
      setApiError(message);
      trackEvent('login_otp_error', { error: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    const next: typeof errors = {};
    if (!/^\d{6}$/.test(otp.trim())) next.otp = 'Enter the 6-digit code.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setApiError('');
    setSubmitting(true);
    trackEvent('login_otp_submitted');
    try {
      await verifyOtp(phone, otp);
      router.replace('/home');
    } catch (err) {
      const isNeedsName = err instanceof Error && (err as Error & { needsName?: boolean }).needsName;
      const message = isNeedsName
        ? 'No account found for this number. Please sign up.'
        : err instanceof Error
        ? err.message
        : 'Login failed';
      setApiError(message);
      trackEvent('login_otp_error', { error: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuest = () => {
    trackEvent('guest_continue');
    router.replace('/home');
  };

  const isOtpMode = mode === 'otp';
  const primaryAction = isOtpMode
    ? otpSent
      ? { label: submitting ? 'Verifying…' : 'Verify & Log In', onPress: handleVerifyOtp }
      : { label: submitting ? 'Sending…' : 'Send OTP', onPress: handleSendOtp }
    : { label: submitting ? 'Logging in…' : 'Log In', onPress: handlePasswordLogin };

  return (
    <Screen>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/onboarding'))}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 32,
            }}
          >
            <ChevronLeft size={22} color={theme.text} />
          </TouchableOpacity>

          <View style={{ width: 100, height: 100, borderRadius: 50, overflow: 'hidden', alignSelf: 'flex-start', marginBottom: 16 }}>
            <Image
              source={require('../assets/moodfood-logo.png')}
              style={{ width: 100, height: 100 }}
              resizeMode="contain"
            />
          </View>

          <Animated.View style={{ opacity, transform: [{ translateY }], alignItems: 'flex-start', marginBottom: 28 }}>
            <Text style={[fw(900), { fontSize: 34, color: theme.text, lineHeight: 42 }]}>Welcome back</Text>
            <Text style={[fw(600), { fontSize: 15, color: theme.subtext, marginTop: 8 }]}>
              Log in to save your cravings and pick up where you left off.
            </Text>
          </Animated.View>

          <View style={{ gap: 18 }}>
            <AuthTextField
              label="Phone Number"
              value={phone}
              onChangeText={(t: string) => { setPhone(t); if (errors.phone) setErrors((e) => ({ ...e, phone: undefined })); }}
              placeholder="+1 234 567 8900"
              keyboardType="phone-pad"
              autoCorrect={false}
              returnKeyType="next"
              error={errors.phone}
              icon={<Phone size={20} color={theme.muted} />}
            />

            {isOtpMode ? (
              otpSent ? (
                <>
                  <AuthTextField
                    label="Verification Code"
                    value={otp}
                    onChangeText={(t: string) => { setOtp(t); if (errors.otp) setErrors((e) => ({ ...e, otp: undefined })); }}
                    placeholder="6-digit code"
                    keyboardType="number-pad"
                    autoCorrect={false}
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={handleVerifyOtp}
                    error={errors.otp}
                    icon={<MessageSquare size={20} color={theme.muted} />}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <TouchableOpacity onPress={() => { setOtpSent(false); setOtp(''); }} activeOpacity={0.7}>
                      <Text style={[fw(700), { fontSize: 12, color: colors.orange }]}>Change number</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleSendOtp} disabled={submitting || countdown > 0} activeOpacity={0.7}>
                      <Text style={[fw(700), { fontSize: 12, color: countdown > 0 ? theme.muted : colors.orange }]}>
                        {countdown > 0 ? `Resend in ${countdown}s` : 'Resend OTP'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <Text style={[fw(600), { fontSize: 13, color: theme.subtext }]}>
                  We’ll send a 6-digit verification code to this number.
                </Text>
              )
            ) : (
              <>
                <AuthTextField
                  label="Password"
                  value={password}
                  onChangeText={(t: string) => { setPassword(t); if (errors.password) setErrors((e) => ({ ...e, password: undefined })); }}
                  placeholder="••••••••"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handlePasswordLogin}
                  error={errors.password}
                  icon={<Lock size={20} color={theme.muted} />}
                />
                <TouchableOpacity onPress={() => setShowPassword((s) => !s)} style={{ alignSelf: 'flex-end' }}>
                  <Text style={[fw(700), { fontSize: 12, color: colors.orange }]}>
                    {showPassword ? 'Hide password' : 'Show password'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <GradientButton
            label={primaryAction.label}
            onPress={primaryAction.onPress}
            disabled={submitting}
            icon={<ArrowRight size={20} color="#fff" />}
            colors={['#ea580c', '#f97316']}
            style={{ marginTop: 32 }}
          />

          {apiError ? (
            <Text style={[fw(600), { color: colors.red, textAlign: 'center', marginTop: 16, fontSize: 14 }]}>
              {apiError}
            </Text>
          ) : null}

          <TouchableOpacity onPress={() => switchMode(isOtpMode ? 'password' : 'otp')} activeOpacity={0.7} style={{ marginTop: 18, alignItems: 'center' }}>
            <Text style={[fw(700), { fontSize: 14, color: colors.orange }]}>
              {isOtpMode ? 'Log in with password' : 'Log in with OTP'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleGuest} activeOpacity={0.7} style={{ marginTop: 12, alignItems: 'center' }}>
            <Text style={[fw(700), { fontSize: 14, color: theme.muted }]}>Continue as guest</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 'auto', paddingTop: 32 }}>
            <Text style={[fw(600), { fontSize: 14, color: theme.subtext }]}>New here?</Text>
            <TouchableOpacity onPress={() => router.push('/signup')} activeOpacity={0.7}>
              <Text style={[fw(800), { fontSize: 14, color: colors.orange }]}>Create an account</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
