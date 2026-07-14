import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator, Linking, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { fw, colors } from '../src/constants/theme';
import { getHeaders } from '../src/services/apiBase';
import { fetchCurrentUser } from '../src/services/auth';
import { initiateSwiggyOAuth, unlinkSwiggy } from '../src/services/swiggy';

export default function SwiggyConnectScreen() {
  const router = useRouter();
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const user = await fetchCurrentUser();
      setLinked(!!user?.swiggyLinked);
    } catch {
      setLinked(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkStatus();
    });
    return () => sub.remove();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const headers = await getHeaders();
      const authUrl = await initiateSwiggyOAuth(headers);
      await Linking.openURL(authUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not start Swiggy connection');
    } finally {
      setConnecting(false);
    }
  };

  const handleUnlink = async () => {
    setConnecting(true);
    setError(null);
    try {
      const headers = await getHeaders();
      await unlinkSwiggy(headers);
      setLinked(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not unlink Swiggy');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff5eb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff5eb" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18, lineHeight: 22 }}>←</Text>
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 20, color: colors.navy }]}>Connect Swiggy</Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.orange} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} showsVerticalScrollIndicator={false}>
          <LinearGradient
            colors={linked ? ['#f0fdf4', '#dcfce7'] : ['#fff7ed', '#fef3c7']}
            style={{ borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 }}
          >
            <Text style={{ fontSize: 56 }}>{linked ? '✅' : '🍽️'}</Text>
            <Text style={[fw(900), { fontSize: 20, color: colors.navy, textAlign: 'center' }]}>
              {linked ? 'Swiggy Connected' : 'Connect your Swiggy'}
            </Text>
            <Text style={[fw(600), { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20 }]}>
              {linked
                ? 'Your Swiggy account is linked. MoodFood uses your location and order history to recommend nearby restaurants.'
                : 'Link your Swiggy account so MoodFood can show real restaurants near you, live ETAs, and actual menu prices.'}
            </Text>
          </LinearGradient>

          {!linked && (
            <View style={{ gap: 10 }}>
              {[
                { icon: '📍', title: 'Nearby restaurants', desc: 'See which places can deliver to you right now' },
                { icon: '🕐', title: 'Live ETAs', desc: 'Real delivery times, not estimates' },
                { icon: '💰', title: 'Actual prices', desc: 'Menu prices from open restaurants near you' },
              ].map((item) => (
                <View
                  key={item.title}
                  style={{ padding: 16, borderRadius: 14, backgroundColor: '#fff', flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}
                >
                  <Text style={{ fontSize: 24 }}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[fw(800), { fontSize: 14, color: colors.navy }]}>{item.title}</Text>
                    <Text style={[fw(600), { fontSize: 12, color: '#94a3b8', marginTop: 2 }]}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {error && (
            <View style={{ padding: 14, borderRadius: 12, backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#fecaca' }}>
              <Text style={[fw(600), { fontSize: 13, color: '#dc2626' }]}>⚠️ {error}</Text>
            </View>
          )}

          {linked ? (
            <TouchableOpacity
              onPress={handleUnlink}
              disabled={connecting}
              activeOpacity={0.85}
              style={{ padding: 16, borderRadius: 14, backgroundColor: '#fff0f0', borderWidth: 1, borderColor: '#fecaca', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: connecting ? 0.6 : 1 }}
            >
              {connecting
                ? <ActivityIndicator size="small" color="#dc2626" />
                : <Text style={{ fontSize: 18 }}>🔗</Text>}
              <Text style={[fw(700), { fontSize: 15, color: '#dc2626' }]}>
                {connecting ? 'Unlinking…' : 'Disconnect Swiggy'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleConnect} disabled={connecting} activeOpacity={0.85}>
              <LinearGradient
                colors={['#f97316', '#fbbf24']}
                style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, opacity: connecting ? 0.7 : 1 }}
              >
                {connecting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 20 }}>🔗</Text>}
                <Text style={[fw(900), { fontSize: 17, color: '#fff' }]}>
                  {connecting ? 'Opening Swiggy…' : 'Connect Swiggy'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          <Text style={[fw(600), { fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 16 }]}>
            MoodFood only reads your delivery address to find nearby restaurants. We never place orders or access payment details on your behalf.
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
