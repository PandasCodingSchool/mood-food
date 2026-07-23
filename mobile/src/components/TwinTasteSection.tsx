import { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { fw, colors } from '../constants/theme';
import { fetchTwinTaste } from '../services/signals';

// 3.7 — Twin taste matching: light social proof without a social graph.
// Surfaces aggregates only ("people like you"), never named individuals.
export default function TwinTasteSection() {
  const [dishes, setDishes] = useState<Array<{ dishId: string; dishName: string; lovedBy: number }>>([]);

  useEffect(() => {
    fetchTwinTaste().then((res) => setDishes(res.dishes));
  }, []);

  if (dishes.length === 0) return null;

  return (
    <View style={{ marginTop: 20, paddingHorizontal: 24 }}>
      <Text style={[fw(800), { fontSize: 13, color: colors.navy, marginBottom: 10 }]}>
        👥 People like you are loving
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {dishes.map((d) => (
          <View
            key={d.dishId}
            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', minWidth: 120 }}
          >
            <Text style={[fw(800), { fontSize: 13, color: colors.navy }]} numberOfLines={1}>{d.dishName}</Text>
            <Text style={[fw(600), { fontSize: 11, color: '#94a3b8', marginTop: 2 }]}>Loved by {d.lovedBy} similar tastes</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
