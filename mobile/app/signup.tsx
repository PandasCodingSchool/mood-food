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
import { ChevronLeft, User, Phone, Lock, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { fw, colors } from '../src/constants/theme';
import Screen from '../src/components/Screen';
import GradientButton from '../src/components/GradientButton';
import AuthTextField from '../src/components/AuthTextField';
import { fadeUp } from '../src/utils/animations';
import { trackEvent } from '../src/utils/analytics';
import { signup } from '../src/services/auth';

const PHONE_RE = /^\+?[0-9\s-]{7,15}$/;

type Errors = { name?: string; phone?: string; password?: string; confirmPassword?: string };

export default function SignupScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    fadeUp(opacity, translateY);
  }, []);

  const clearError = (key: keyof Errors) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const handleSignup = async () => {
    const next: Errors = {};
    if (!name.trim()) next.name = 'Tell us what to call you.';
    if (!PHONE_RE.test(phone.trim())) next.phone = 'Enter a valid phone number.';
    if (password.length < 6) next.password = 'Password must be at least 6 characters.';
    if (confirmPassword !== password) next.confirmPassword = 'Passwords don\'t match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setApiError('');
    setSubmitting(true);
    trackEvent('signup_submitted');
    try {
      await signup(name, phone, password);
      router.replace('/preferences');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign up failed';
      setApiError(message);
      trackEvent('signup_error', { error: message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuest = () => {
    trackEvent('guest_continue');
    router.replace('/home');
  };

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
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
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

          <View style={{ width: 160, height: 72, borderRadius: 36, overflow: 'hidden', alignSelf: 'flex-start', marginBottom: 16 }}>
            <Image
              source={require('../assets/moodfood-logo.png')}
              style={{ width: 160, height: 72 }}
              resizeMode="contain"
            />
          </View>

          <Animated.View style={{ opacity, transform: [{ translateY }], alignItems: 'flex-start', marginBottom: 24 }}>
            <Text style={[fw(900), { fontSize: 34, color: theme.text, lineHeight: 42 }]}>Create account</Text>
            <Text style={[fw(600), { fontSize: 15, color: theme.subtext, marginTop: 8 }]}>
              Join MoodFood and start finding your vibe.
            </Text>
          </Animated.View>

          <View style={{ gap: 18 }}>
            <AuthTextField
              label="Name"
              value={name}
              onChangeText={(t) => { setName(t); clearError('name'); }}
              placeholder="Your name"
              autoCapitalize="words"
              returnKeyType="next"
              error={errors.name}
              icon={<User size={20} color={theme.muted} />}
            />
            <AuthTextField
              label="Phone Number"
              value={phone}
              onChangeText={(t) => { setPhone(t); clearError('phone'); }}
              placeholder="+1 234 567 8900"
              keyboardType="phone-pad"
              autoCorrect={false}
              returnKeyType="next"
              error={errors.phone}
              icon={<Phone size={20} color={theme.muted} />}
            />
            <AuthTextField
              label="Password"
              value={password}
              onChangeText={(t) => { setPassword(t); clearError('password'); }}
              placeholder="At least 6 characters"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType="next"
              error={errors.password}
              icon={<Lock size={20} color={theme.muted} />}
            />
            <AuthTextField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); clearError('confirmPassword'); }}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSignup}
              error={errors.confirmPassword}
              icon={<Lock size={20} color={theme.muted} />}
            />
            <TouchableOpacity onPress={() => setShowPassword((s) => !s)} style={{ alignSelf: 'flex-end' }}>
              <Text style={[fw(700), { fontSize: 12, color: colors.orange }]}>
                {showPassword ? 'Hide passwords' : 'Show passwords'}
              </Text>
            </TouchableOpacity>
          </View>

          <GradientButton
            label={submitting ? 'Creating account…' : 'Sign Up'}
            onPress={handleSignup}
            disabled={submitting}
            icon={<ArrowRight size={20} color="#fff" />}
            colors={['#ea580c', '#f97316']}
            style={{ marginTop: 28 }}
          />

          {apiError ? (
            <Text style={[fw(600), { color: colors.red, textAlign: 'center', marginTop: 16, fontSize: 14 }]}>
              {apiError}
            </Text>
          ) : null}

          <TouchableOpacity onPress={handleGuest} activeOpacity={0.7} style={{ marginTop: 18, alignItems: 'center' }}>
            <Text style={[fw(700), { fontSize: 14, color: theme.muted }]}>Continue as guest</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 'auto', paddingTop: 32 }}>
            <Text style={[fw(600), { fontSize: 14, color: theme.subtext }]}>Already have an account?</Text>
            <TouchableOpacity onPress={() => router.push('/login')} activeOpacity={0.7}>
              <Text style={[fw(800), { fontSize: 14, color: colors.orange }]}>Log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
