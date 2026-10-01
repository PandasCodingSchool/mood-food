import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../src/context/ThemeContext';
import { fw, colors } from '../../src/constants/theme';
import StepChecklist from '../../src/components/StepChecklist';
import { getDiySession, updateDiySession, type Recipe } from '../../src/services/diy';

export default function DiyCookScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const params = useLocalSearchParams<{ recipe: string; sessionId: string }>();
  const recipe: Recipe = JSON.parse(params.recipe);
  const sessionId = params.sessionId || null;

  const [completed, setCompleted] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const result = await getDiySession(sessionId);
      if (result.success && result.session) {
        setCompleted(new Set(result.session.completedSteps));
      }
    })();
  }, [sessionId]);

  const toggleStep = (index: number) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      if (sessionId) void updateDiySession(sessionId, { completedSteps: Array.from(next) });
      return next;
    });
  };

  const allDone = recipe.steps.length > 0 && completed.size === recipe.steps.length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <View style={{ paddingTop: safeTop + 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[fw(900), { fontSize: 18, color: theme.text, flex: 1, textAlign: 'center', marginRight: 40 }]}>
          Cooking — {recipe.dish}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 140 + safeBottom, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(22,163,74,0.06)' }}>
          <Text style={[fw(700), { fontSize: 12, color: colors.green }]}>
            {completed.size}/{recipe.steps.length} steps done — tap a step to check it off.
          </Text>
        </View>

        <StepChecklist steps={recipe.steps} completed={completed} onToggle={toggleStep} />

        {allDone && (
          <View style={{ padding: 16, borderRadius: 16, backgroundColor: 'rgba(249,115,22,0.06)', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 28 }}>🎉</Text>
            <Text style={[fw(800), { fontSize: 14, color: theme.text, textAlign: 'center' }]}>
              You cooked it! Snap a photo for your wall.
            </Text>
          </View>
        )}
      </ScrollView>

      {allDone && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, paddingBottom: 24 + safeBottom, backgroundColor: theme.navBg }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/diy/wall', params: { sessionId: sessionId || '', dishName: recipe.dish } })}
            style={{ height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.orange }}
          >
            <Text style={[fw(900), { fontSize: 18, color: '#fff' }]}>📸 Add to my wall</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
