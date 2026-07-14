import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { fw, colors } from '../src/constants/theme';
import GradientButton from '../src/components/GradientButton';
import AuthTextField from '../src/components/AuthTextField';
import { fadeUp } from '../src/utils/animations';
import { trackEvent } from '../src/utils/analytics';
import { signup } from '../src/services/auth';

const PHONE_RE = /^\+?[0-9\s-]{7,15}$/;

type Errors = { name?: string; phone?: string; password?: string; confirmPassword?: string };

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      router.replace('/home');
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
    <View style={{ flex: 1, backgroundColor: '#fff5eb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff5eb" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 60, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}
          >
            <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
          </TouchableOpacity>

          <Animated.View style={{ opacity, transform: [{ translateY }], alignItems: 'center', marginBottom: 32 }}>
            <Image
              source={require('../assets/moodfood-logo.png')}
              style={{ width: 72, height: 72, marginBottom: 16 }}
              resizeMode="contain"
            />
            <Text style={[fw(900), { fontSize: 26, color: colors.navy }]}>Create your account</Text>
            <Text style={[fw(600), { fontSize: 14, color: '#94a3b8', marginTop: 6, textAlign: 'center' }]}>
              Join MoodFood and start finding your vibe.
            </Text>
          </Animated.View>

          <View style={{ gap: 16 }}>
            <AuthTextField
              label="Name"
              value={name}
              onChangeText={(t) => { setName(t); clearError('name'); }}
              placeholder="Your name"
              autoCapitalize="words"
              returnKeyType="next"
              error={errors.name}
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
            />
            <AuthTextField
              label="Password"
              value={password}
              onChangeText={(t) => { setPassword(t); clearError('password'); }}
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="next"
              error={errors.password}
            />
            <AuthTextField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={(t) => { setConfirmPassword(t); clearError('confirmPassword'); }}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={handleSignup}
              error={errors.confirmPassword}
            />
          </View>

          <GradientButton
            label={submitting ? 'Creating account…' : 'Sign Up'}
            colors={['#f97316', '#fbbf24']}
            onPress={handleSignup}
            disabled={submitting}
            style={{ marginTop: 28 }}
          />

          {apiError ? (
            <Text style={[fw(600), { color: colors.red, textAlign: 'center', marginTop: 16, fontSize: 14 }]}>
              {apiError}
            </Text>
          ) : null}

          <TouchableOpacity onPress={handleGuest} activeOpacity={0.7} style={{ marginTop: 16, alignItems: 'center' }}>
            <Text style={[fw(700), { fontSize: 14, color: '#94a3b8' }]}>Continue as guest</Text>
          </TouchableOpacity>

          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 'auto', paddingTop: 32 }}>
            <Text style={[fw(600), { fontSize: 14, color: '#64748b' }]}>Already have an account?</Text>
            <TouchableOpacity onPress={() => router.push('/login')} activeOpacity={0.7}>
              <Text style={[fw(800), { fontSize: 14, color: colors.orange }]}>Log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
