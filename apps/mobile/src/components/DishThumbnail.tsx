import { useState } from 'react';
import { Image } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { resolveDishImage, dishIcon } from '../utils/dishVisuals';
import type { Recommendation } from '../types';

/** Small inline dish visual — real Swiggy/AI photo when available, icon fallback otherwise. */
export default function DishThumbnail({
  rec,
  size = 44,
  fontSize,
}: {
  rec: Recommendation;
  size?: number;
  fontSize?: number;
}) {
  const { theme } = useTheme();
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
  const Icon = dishIcon(rec);
  return <Icon size={fontSize ?? size * 0.8} color={theme.text} />;
}
