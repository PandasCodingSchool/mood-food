import { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Users } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fw } from '../constants/theme';
import { fetchTwinTaste } from '../services/signals';

// 3.7 — Twin taste matching: light social proof without a social graph.
// Surfaces aggregates only ("people like you"), never named individuals.
export default function TwinTasteSection() {
  const { theme } = useTheme();
  const [dishes, setDishes] = useState<Array<{ dishId: string; dishName: string; lovedBy: number }>>([]);

  useEffect(() => {
    fetchTwinTaste().then((res) => setDishes(res.dishes));
  }, []);

  if (dishes.length === 0) return null;

  return (
    <View style={{ marginTop: 20, paddingHorizontal: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Users size={14} color={theme.subtext} />
        <Text style={[fw(800), { fontSize: 13, color: theme.text }]}>
          People like you are loving
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {dishes.map((d) => (
          <View
            key={d.dishId}
            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, minWidth: 120 }}
          >
            <Text style={[fw(800), { fontSize: 13, color: theme.text }]} numberOfLines={1}>{d.dishName}</Text>
            <Text style={[fw(600), { fontSize: 11, color: theme.subtext, marginTop: 2 }]}>Loved by {d.lovedBy} similar tastes</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
