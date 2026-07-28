import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StatusBar, ScrollView, ActivityIndicator, Linking, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, MapPin, Clock, Coins, Unlink, Link2, Check } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { fw, colors } from '../src/constants/theme';
import Screen from '../src/components/Screen';
import { getHeaders } from '../src/services/apiBase';
import { fetchCurrentUser } from '../src/services/auth';
import { saveAddressId, fetchAddresses } from '../src/services/aiRecommendations';
import { initiateSwiggyOAuth, unlinkSwiggy } from '../src/services/swiggy';

export default function SwiggyConnectScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [linked, setLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const user = await fetchCurrentUser();
      const isLinked = !!user?.swiggyLinked;
      setLinked(isLinked);
      if (isLinked) {
        const addresses = await fetchAddresses();
        if (addresses.length > 0) {
          await saveAddressId(addresses[0].id);
        }
      }
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
    <Screen>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} backgroundColor={theme.bg} />
      <View style={{ paddingTop: 60, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 20, color: theme.text }]}>Connect Swiggy</Text>
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
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: linked ? 'rgba(34,197,94,0.12)' : 'rgba(249,115,22,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              {linked ? <Check size={36} color={colors.green} /> : <Link2 size={36} color={colors.orange} />}
            </View>
            <Text style={[fw(900), { fontSize: 20, color: theme.text, textAlign: 'center' }]}>
              {linked ? 'Swiggy Connected' : 'Connect your Swiggy'}
            </Text>
            <Text style={[fw(600), { fontSize: 13, color: theme.subtext, textAlign: 'center', lineHeight: 20 }]}>
              {linked
                ? 'Your Swiggy account is linked. MoodFood uses your location and order history to recommend nearby restaurants.'
                : 'Link your Swiggy account so MoodFood can show real restaurants near you, live ETAs, and actual menu prices.'}
            </Text>
          </LinearGradient>

          {!linked && (
            <View style={{ gap: 10 }}>
              {[
                { icon: <MapPin size={24} color={colors.orange} />, title: 'Nearby restaurants', desc: 'See which places can deliver to you right now' },
                { icon: <Clock size={24} color={colors.orange} />, title: 'Live ETAs', desc: 'Real delivery times, not estimates' },
                { icon: <Coins size={24} color={colors.orange} />, title: 'Actual prices', desc: 'Menu prices from open restaurants near you' },
              ].map((item) => (
                <View
                  key={item.title}
                  style={{ padding: 16, borderRadius: 14, backgroundColor: theme.card, flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.border }}
                >
                  <View style={{ width: 32, alignItems: 'center' }}>{item.icon}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={[fw(800), { fontSize: 14, color: theme.text }]}>{item.title}</Text>
                    <Text style={[fw(600), { fontSize: 12, color: theme.subtext, marginTop: 2 }]}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {error && (
            <View style={{ padding: 14, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' }}>
              <Text style={[fw(600), { fontSize: 13, color: colors.red }]}>{error}</Text>
            </View>
          )}

          {linked ? (
            <TouchableOpacity
              onPress={handleUnlink}
              disabled={connecting}
              activeOpacity={0.85}
              style={{ padding: 16, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: connecting ? 0.6 : 1 }}
            >
              {connecting
                ? <ActivityIndicator size="small" color={colors.red} />
                : <Unlink size={20} color={colors.red} />}
              <Text style={[fw(700), { fontSize: 15, color: colors.red }]}>
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
                  : <Link2 size={20} color="#fff" />}
                <Text style={[fw(900), { fontSize: 17, color: '#fff' }]}>
                  {connecting ? 'Opening Swiggy…' : 'Connect Swiggy'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          <Text style={[fw(600), { fontSize: 11, color: theme.subtext, textAlign: 'center', lineHeight: 16 }]}>
            MoodFood can place orders on Swiggy on your behalf once you confirm each one — you'll always see the address, items, and total before anything is ordered. We never see or store your card/UPI details; Swiggy handles payment directly.
          </Text>
        </ScrollView>
      )}
    </Screen>
  );
}
