import { View, Text, TouchableOpacity } from 'react-native';
import type { ComponentType } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { fw } from '../../constants/theme';

type LucideIcon = ComponentType<{ size?: number; color?: string }>;

export interface ChipOption {
  id: string;
  label: string;
  Icon?: LucideIcon;
}

interface ChipSelectorProps {
  options: ChipOption[];
  selected: string[];
  onToggle: (id: string) => void;
  multiSelect?: boolean;
  accent?: string;
}

// Multi-select (or single-select) chip grid used by craving radar, veto
// reasons, nostalgia prompts, and pantry input.
export default function ChipSelector({
  options,
  selected,
  onToggle,
  multiSelect = true,
  accent = '#f97316',
}: ChipSelectorProps) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
        const OptionIcon = option.Icon;
        return (
          <TouchableOpacity
            key={option.id}
            activeOpacity={0.8}
            onPress={() => onToggle(option.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 20,
              backgroundColor: isSelected ? accent : theme.card,
              borderWidth: 2,
              borderColor: isSelected ? accent : theme.border,
            }}
          >
            {OptionIcon ? <OptionIcon size={16} color={isSelected ? '#fff' : theme.text} /> : null}
            <Text style={[fw(800), { fontSize: 14, color: isSelected ? '#fff' : theme.text }]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
