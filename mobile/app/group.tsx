import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StatusBar, TextInput, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Users, Check, Clock, X, Heart, Trophy, ArrowRight } from 'lucide-react-native';
import { useTheme } from '../src/context/ThemeContext';
import { SNACK_CARDS } from '../src/constants/snackCards';
import { fw, colors } from '../src/constants/theme';
import { trackEvent } from '../src/utils/analytics';
import {
  createGroup,
  joinGroup,
  fetchGroup,
  submitGroupSwipes,
  fetchConsensus,
  type GroupMember,
  type ConsensusOption,
} from '../src/services/groups';

type Stage = 'landing' | 'lobby' | 'swipe' | 'results';

// 3.6 — Group / social decision games. Multiplayer swipe → AI finds the
// overlap via maximin consensus (nobody is miserable). Poll-based lobby, no
// websockets needed at this scale.
export default function GroupScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [stage, setStage] = useState<Stage>('landing');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [memberKey, setMemberKey] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [swipeIdx, setSwipeIdx] = useState(0);
  const [swipes, setSwipes] = useState<Array<{ item: string; liked: boolean }>>([]);
  const [options, setOptions] = useState<ConsensusOption[]>([]);

  const pollLobby = useCallback(async () => {
    if (!code) return;
    const group = await fetchGroup(code);
    if (group) setMembers(group.members);
  }, [code]);

  useEffect(() => {
    if (stage !== 'lobby') return;
    pollLobby();
    const id = setInterval(pollLobby, 3000);
    return () => clearInterval(id);
  }, [stage, pollLobby]);

  const handleCreate = async () => {
    const newCode = await createGroup();
    if (!newCode) return;
    setCode(newCode);
    const key = await joinGroup(newCode, displayName || 'Host');
    setMemberKey(key);
    trackEvent('group_created', { code: newCode });
    setStage('lobby');
  };

  const handleJoin = async () => {
    const upper = joinCode.trim().toUpperCase();
    if (!upper) return;
    const key = await joinGroup(upper, displayName || 'Guest');
    if (!key) return;
    setCode(upper);
    setMemberKey(key);
    trackEvent('group_joined', { code: upper });
    setStage('lobby');
  };

  const handleStartSwipe = () => setStage('swipe');

  const handleSwipe = (liked: boolean) => {
    const card = SNACK_CARDS[swipeIdx];
    const next = [...swipes, { item: card.name, liked }];
    setSwipes(next);
    if (swipeIdx + 1 >= SNACK_CARDS.length) {
      if (memberKey) void submitGroupSwipes(code, memberKey, next);
      setStage('lobby');
    } else {
      setSwipeIdx((i) => i + 1);
    }
  };

  const handleGetConsensus = async () => {
    const opts = await fetchConsensus(code);
    setOptions(opts);
    setStage('results');
  };

  if (stage === 'landing') {
    return (
      <LinearGradient colors={[theme.bg, theme.surface]} style={{ flex: 1 }}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
        <View style={{ paddingTop: 70, paddingHorizontal: 24 }}>
          <Users size={40} color={colors.orange} />
          <Text style={[fw(900), { fontSize: 24, color: theme.text, marginTop: 12 }]}>Group decide</Text>
          <Text style={[fw(600), { fontSize: 14, color: theme.subtext, marginTop: 4 }]}>
            Everyone swipes, we find what nobody's miserable about.
          </Text>
        </View>
        <View style={{ padding: 24, gap: 12 }}>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={theme.muted}
            style={{ padding: 14, borderRadius: 14, backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.border, fontSize: 14, color: theme.text }}
          />
          <TouchableOpacity onPress={handleCreate} activeOpacity={0.85}>
            <LinearGradient colors={['#f97316', '#fbbf24']} style={{ height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
              <Text style={[fw(900), { fontSize: 16, color: '#fff' }]}>Start a group</Text>
              <ArrowRight size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Enter code"
              placeholderTextColor={theme.muted}
              autoCapitalize="characters"
              style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: theme.card, borderWidth: 1.5, borderColor: theme.border, fontSize: 14, color: theme.text }}
            />
            <TouchableOpacity onPress={handleJoin} activeOpacity={0.85} style={{ paddingHorizontal: 20, borderRadius: 14, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[fw(800), { fontSize: 14, color: '#fff' }]}>Join</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    );
  }

  if (stage === 'lobby') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
        <View style={{ paddingTop: 70, paddingHorizontal: 24, alignItems: 'center' }}>
          <Text style={[fw(700), { fontSize: 13, color: theme.subtext }]}>Room code</Text>
          <Text style={[fw(900), { fontSize: 36, color: theme.text, letterSpacing: 4 }]}>{code}</Text>
          <Text style={[fw(600), { fontSize: 12, color: theme.subtext, marginTop: 4 }]}>Share this code with your group</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 8 }}>
          {members.map((m) => (
            <View key={m.memberKey} style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: 12, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}>
              <Text style={[fw(700), { fontSize: 14, color: theme.text }]}>{m.displayName}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {m.swipeCount > 0 ? <Check size={14} color={colors.green} /> : <Clock size={14} color={theme.subtext} />}
                <Text style={[fw(600), { fontSize: 12, color: m.swipeCount > 0 ? colors.green : theme.subtext }]}>{m.swipeCount > 0 ? 'swiped' : 'waiting'}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={{ padding: 24, gap: 10 }}>
          <TouchableOpacity onPress={handleStartSwipe} activeOpacity={0.85}>
            <LinearGradient colors={['#e11d48', '#fb7185']} style={{ height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
              <Text style={[fw(900), { fontSize: 15, color: '#fff' }]}>Swipe your picks</Text>
              <ArrowRight size={18} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleGetConsensus} activeOpacity={0.85} style={{ height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Trophy size={18} color={theme.text} />
              <Text style={[fw(800), { fontSize: 15, color: theme.text }]}>Get group consensus</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (stage === 'swipe') {
    const card = SNACK_CARDS[swipeIdx];
    const CardIcon = card.Icon;
    return (
      <LinearGradient colors={card.colors} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <StatusBar barStyle="light-content" />
        <CardIcon size={96} color="#fff" />
        <Text style={[fw(900), { fontSize: 24, color: '#fff', marginTop: 12 }]}>{card.name}</Text>
        <Text style={[fw(600), { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 }]}>
          {swipeIdx + 1}/{SNACK_CARDS.length}
        </Text>
        <View style={{ flexDirection: 'row', gap: 24, marginTop: 40 }}>
          <TouchableOpacity onPress={() => handleSwipe(false)} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
            <X size={28} color={colors.navy} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleSwipe(true)} style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
            <Heart size={28} color={colors.navy} />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: 70, paddingHorizontal: 24 }}>
        <TouchableOpacity onPress={() => router.push('/home')} style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <ChevronLeft size={22} color={theme.text} />
          <Text style={[fw(700), { fontSize: 16, color: theme.text }]}>Home</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Trophy size={24} color={colors.orange} />
          <Text style={[fw(900), { fontSize: 22, color: theme.text }]}>Group picks</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        {options.length === 0 && (
          <Text style={[fw(600), { fontSize: 13, color: theme.subtext }]}>Not enough swipes yet to find consensus.</Text>
        )}
        {options.map((opt) => (
          <View key={opt.dish_id} style={{ padding: 16, borderRadius: 16, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }}>
            <Text style={[fw(800), { fontSize: 16, color: theme.text }]}>{opt.dish_name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {Object.entries(opt.member_match).map(([name, pct]) => (
                <View key={name} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.orange + '18' }}>
                  <Text style={[fw(700), { fontSize: 11, color: colors.orange }]}>{name}: {pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
