import type { ComponentType } from 'react';
import { Wheat, Egg, Carrot, Beef, Drumstick, Salad, Soup, Package } from 'lucide-react-native';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

export const PANTRY_ITEMS: Array<{ id: string; label: string; Icon: LucideIcon }> = [
  { id: 'rice', label: 'Rice', Icon: Wheat },
  { id: 'pasta', label: 'Pasta', Icon: Wheat },
  { id: 'eggs', label: 'Eggs', Icon: Egg },
  { id: 'bread', label: 'Bread', Icon: Wheat },
  { id: 'vegetables', label: 'Vegetables', Icon: Carrot },
  { id: 'chicken', label: 'Chicken', Icon: Drumstick },
  { id: 'paneer', label: 'Paneer', Icon: Salad },
  { id: 'lentils', label: 'Lentils/Dal', Icon: Soup },
  { id: 'cheese', label: 'Cheese', Icon: Salad },
  { id: 'nothing_much', label: 'Not much', Icon: Package },
];
