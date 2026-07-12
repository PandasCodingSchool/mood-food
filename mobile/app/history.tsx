import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HISTORY_MEALS } from '../src/constants/historyMeals';
import { fw, colors } from '../src/constants/theme';
import BottomNav from '../src/components/BottomNav';

type Tab = 'all' | 'saved' | 'ordered';

export default function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('all');

  const filtered = HISTORY_MEALS.filter((m) => {
    if (tab === 'saved') return m.saved;
    if (tab === 'ordered') return m.ordered;
    return true;
  });

  const showReorder = tab === 'ordered' || tab === 'all';

  return (
    <View style={{ flex: 1, backgroundColor: '#fff5eb' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff5eb" />
      <View style={{ paddingTop: 60, paddingHorizontal: 24 }}>
        <Text style={[fw(900), { fontSize: 24, color: colors.navy }]}>History</Text>
        <Text style={[fw(600), { fontSize: 13, color: '#94a3b8', marginTop: 4 }]}>Your past picks & saved meals</Text>
      </View>

      <View style={{ flexDirection: 'row', margin: 24, marginBottom: 0, backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 14, padding: 3 }}>
        {(['all', 'saved', 'ordered'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1,
              paddingVertical: 10,
              borderRadius: 11,
              backgroundColor: tab === t ? '#fff' : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={[fw(800), { fontSize: 13, color: tab === t ? colors.navy : '#94a3b8', textTransform: 'capitalize' }]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 110, gap: 12 }} showsVerticalScrollIndicator={false}>
        {filtered.map((meal, i) => (
          <View key={i} style={{ backgroundColor: '#fff', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
            <LinearGradient colors={meal.colors} style={{ padding: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 36 }}>{meal.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[fw(800), { fontSize: 16, color: '#fff' }]} numberOfLines={1}>{meal.name}</Text>
                <Text style={[fw(600), { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }]}>{meal.cuisine}</Text>
              </View>
              {meal.saved && (
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>❤️</Text>
                </View>
              )}
            </LinearGradient>
            <View style={{ padding: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(249,115,22,0.08)' }}>
                  <Text style={[fw(700), { fontSize: 11, color: colors.orange }]}>{meal.price}</Text>
                </View>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.04)' }}>
                  <Text style={[fw(700), { fontSize: 11, color: '#64748b' }]}>{meal.via}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[fw(600), { fontSize: 11, color: '#94a3b8' }]}>{meal.date}</Text>
                {meal.ordered && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green, marginLeft: 4 }} />}
              </View>
            </View>
          </View>
        ))}

        {showReorder && (
          <View
            style={{
              padding: 16,
              borderRadius: 16,
              backgroundColor: 'rgba(249,115,22,0.05)',
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: 'rgba(249,115,22,0.2)',
              alignItems: 'center',
            }}
          >
            <Text style={[fw(700), { fontSize: 14, color: colors.orange }]}>🔄 Quick reorder your faves</Text>
            <Text style={[fw(600), { fontSize: 12, color: '#94a3b8', marginTop: 4 }]}>Tap any ordered meal to reorder instantly</Text>
          </View>
        )}
      </ScrollView>

      <BottomNav active="history" />
    </View>
  );
}
