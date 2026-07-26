import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Rocket, PartyPopper } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { fw, colors } from '../src/constants/theme';
import { trackEvent } from '../src/utils/analytics';
import { API_BASE_URL } from '../src/services/apiBase';

const inputBase = { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16 };

export default function WaitlistScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !city.trim()) {
      setError('Name, email and city are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), city: city.trim(), cuisine: cuisine.trim() || null }),
      });

      if (res.status === 409) {
        setError('This email is already registered.');
        return;
      }
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }

      setSuccess(true);
      trackEvent('waitlist_joined', { city: city.trim() });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to join waitlist. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <PartyPopper size={64} color={colors.orange} />
          <Text style={[fw(900), { fontSize: 24, color: theme.text, marginTop: 16, textAlign: 'center' }]}>
            You're on the list!
          </Text>
          <Text style={[fw(600), { fontSize: 14, color: theme.subtext, textAlign: 'center', marginTop: 8, marginBottom: 40, lineHeight: 20 }]}>
            We'll let you know when MoodFood goes live.{'\n'}
            Get ready to eat better.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/')}
            style={{ backgroundColor: colors.orange, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40 }}
          >
            <Text style={[fw(800), { fontSize: 16, color: '#fff' }]}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 32 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ marginRight: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={22} color={theme.text} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={[fw(900), { fontSize: 24, color: theme.text }]}>Join Waitlist</Text>
              <Text style={[fw(600), { fontSize: 13, color: theme.subtext }]}>Be first to know when we launch</Text>
            </View>
          </View>

          <View style={{ backgroundColor: colors.orange + '0A', borderRadius: 18, padding: 16, marginBottom: 32, flexDirection: 'row', alignItems: 'center' }}>
            <Rocket size={28} color={colors.orange} style={{ marginRight: 12 }} />
            <View style={{ flex: 1 }}>
              <Text style={[fw(800), { fontSize: 13, color: theme.text }]}>Early access</Text>
              <Text style={[fw(600), { fontSize: 12, color: theme.subtext, marginTop: 2 }]}>
                Join 100+ people already waiting for MoodFood
              </Text>
            </View>
          </View>

          <View style={{ gap: 16 }}>
            <View>
              <Text style={[fw(700), { fontSize: 14, color: theme.text, marginBottom: 8 }]}>Name *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={theme.muted}
                style={{ ...inputBase, backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View>
              <Text style={[fw(700), { fontSize: 14, color: theme.text, marginBottom: 8 }]}>Email *</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={theme.muted}
                style={{ ...inputBase, backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View>
              <Text style={[fw(700), { fontSize: 14, color: theme.text, marginBottom: 8 }]}>City *</Text>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="Mumbai, Delhi, Bangalore…"
                placeholderTextColor={theme.muted}
                style={{ ...inputBase, backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View>
              <Text style={[fw(700), { fontSize: 14, color: theme.text, marginBottom: 8 }]}>
                Favourite Cuisine{' '}
                <Text style={{ color: theme.muted, fontWeight: '400' }}>(optional)</Text>
              </Text>
              <TextInput
                value={cuisine}
                onChangeText={setCuisine}
                placeholder="Indian, Italian, Japanese…"
                placeholderTextColor={theme.muted}
                style={{ ...inputBase, backgroundColor: theme.card, borderColor: theme.border, color: theme.text }}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
          </View>

          {error && (
            <View style={{ marginTop: 16, backgroundColor: colors.red + '0A', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: colors.red + '20' }}>
              <Text style={[fw(600), { fontSize: 13, color: colors.red }]}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            style={{ marginTop: 24, backgroundColor: colors.orange, borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={[fw(800), { fontSize: 16, color: '#fff' }]}>Join the Waitlist</Text>
                <PartyPopper size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          <Text style={[fw(600), { fontSize: 12, color: theme.muted, textAlign: 'center', marginTop: 16 }]}>
            No spam, ever. We'll only reach out when it matters.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
