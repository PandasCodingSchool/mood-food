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
import { trackEvent } from '../src/utils/analytics';
import { API_BASE_URL } from '../src/services/apiBase';

export default function WaitlistScreen() {
  const router = useRouter();
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
      <SafeAreaView className="flex-1 bg-orange-50">
        <StatusBar barStyle="dark-content" backgroundColor="#fff7ed" />
        <View className="flex-1 items-center justify-center px-6">
          <Text style={{ fontSize: 64 }}>🎉</Text>
          <Text className="text-2xl font-bold text-gray-900 mt-4 text-center">
            You're on the list!
          </Text>
          <Text className="text-gray-500 text-center mt-2 mb-10 leading-relaxed">
            We'll let you know when MoodFood goes live.{'\n'}
            Get ready to eat better.
          </Text>
          <TouchableOpacity
            onPress={() => router.replace('/')}
            className="bg-orange-500 rounded-2xl py-4 px-10"
          >
            <Text className="text-white font-bold text-lg">Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View className="flex-row items-center mb-8">
            <TouchableOpacity
              onPress={() => router.back()}
              className="mr-4 w-10 h-10 rounded-full bg-gray-100 items-center justify-center"
            >
              <Text className="text-gray-700 text-lg">←</Text>
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-2xl font-bold text-gray-900">Join Waitlist</Text>
              <Text className="text-gray-500 text-sm">Be first to know when we launch</Text>
            </View>
          </View>

          {/* Badge */}
          <View className="bg-orange-50 rounded-2xl p-4 mb-8 flex-row items-center">
            <Text style={{ fontSize: 28 }} className="mr-3">🚀</Text>
            <View className="flex-1">
              <Text className="text-gray-800 font-semibold text-sm">Early access</Text>
              <Text className="text-gray-500 text-xs mt-0.5">
                Join 100+ people already waiting for MoodFood
              </Text>
            </View>
          </View>

          {/* Form */}
          <View className="gap-4">
            <View>
              <Text className="text-gray-700 font-semibold mb-2">Name *</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#9ca3af"
                className="border-2 border-gray-100 rounded-xl px-4 py-3 text-gray-900 bg-white text-base"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View>
              <Text className="text-gray-700 font-semibold mb-2">Email *</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#9ca3af"
                className="border-2 border-gray-100 rounded-xl px-4 py-3 text-gray-900 bg-white text-base"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View>
              <Text className="text-gray-700 font-semibold mb-2">City *</Text>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="Mumbai, Delhi, Bangalore…"
                placeholderTextColor="#9ca3af"
                className="border-2 border-gray-100 rounded-xl px-4 py-3 text-gray-900 bg-white text-base"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View>
              <Text className="text-gray-700 font-semibold mb-2">
                Favourite Cuisine{' '}
                <Text className="text-gray-400 font-normal">(optional)</Text>
              </Text>
              <TextInput
                value={cuisine}
                onChangeText={setCuisine}
                placeholder="Indian, Italian, Japanese…"
                placeholderTextColor="#9ca3af"
                className="border-2 border-gray-100 rounded-xl px-4 py-3 text-gray-900 bg-white text-base"
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
          </View>

          {error && (
            <View className="mt-4 bg-red-50 rounded-xl px-4 py-3">
              <Text className="text-red-600 text-sm">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            className="mt-6 bg-orange-500 rounded-2xl py-4 items-center"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-lg">Join the Waitlist 🎉</Text>
            )}
          </TouchableOpacity>

          <Text className="text-gray-400 text-xs text-center mt-4">
            No spam, ever. We'll only reach out when it matters.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
