import type { ComponentType } from 'react';
import { Cookie, Soup, Salad, Flame, Citrus, Pizza, Drumstick, IceCream, Droplets, Wheat } from 'lucide-react-native';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

export interface CravingTag {
  id: string;
  label: string;
  Icon: LucideIcon;
}

// Sensation-level tags — texture/temperature/richness predict better than
// cuisine labels ("crunchy and warm" routes better than "Thai").
export const CRAVING_TAGS: CravingTag[] = [
  { id: 'crunchy', label: 'Crunchy', Icon: Cookie },
  { id: 'melty', label: 'Melty', Icon: Pizza },
  { id: 'spicy', label: 'Spicy', Icon: Flame },
  { id: 'brothy', label: 'Brothy', Icon: Soup },
  { id: 'fresh', label: 'Fresh', Icon: Salad },
  { id: 'cheesy', label: 'Cheesy', Icon: Pizza },
  { id: 'crispy', label: 'Crispy', Icon: Drumstick },
  { id: 'creamy', label: 'Creamy', Icon: Soup },
  { id: 'sweet', label: 'Sweet', Icon: IceCream },
  { id: 'tangy', label: 'Tangy', Icon: Citrus },
  { id: 'smoky', label: 'Smoky', Icon: Flame },
  { id: 'juicy', label: 'Juicy', Icon: Droplets },
];
