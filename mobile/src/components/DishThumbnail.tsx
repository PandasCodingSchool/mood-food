import { useState } from 'react';
import { Image, Text } from 'react-native';
import { resolveDishImage, dishEmoji } from '../utils/dishVisuals';
import type { Recommendation } from '../types';

/** Small inline dish visual — real Swiggy/AI photo when available, emoji fallback otherwise. */
export default function DishThumbnail({
  rec,
  size = 44,
  fontSize,
}: {
  rec: Recommendation;
  size?: number;
  fontSize?: number;
}) {
  const [failed, setFailed] = useState(false);
  const url = !failed ? resolveDishImage(rec) : null;

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 4 }}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <Text style={{ fontSize: fontSize ?? size * 0.8 }}>{dishEmoji(rec)}</Text>;
}
