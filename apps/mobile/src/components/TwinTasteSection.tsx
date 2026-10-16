import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { space } from '@moodfood/tokens';
import { SectionHeader, Surface, Text } from '@moodfood/ui';
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
    <>
      <SectionHeader title="People like you are loving" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: space.gutter }}>
        {dishes.map((d) => (
          <Surface key={d.dishId} radius={20} padding={14} style={{ minWidth: 150, maxWidth: 220 }}>
            <Text variant="bodyStrong14" numberOfLines={1}>{d.dishName}</Text>
            <Text variant="caption12" tone="ink2" style={{ marginTop: 3 }}>{`Loved by ${d.lovedBy} similar tastes`}</Text>
          </Surface>
        ))}
      </ScrollView>
    </>
  );
}
