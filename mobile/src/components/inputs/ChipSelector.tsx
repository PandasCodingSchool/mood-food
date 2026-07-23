import { View, Text, TouchableOpacity } from 'react-native';
import { fw, colors } from '../../constants/theme';

export interface ChipOption {
  id: string;
  label: string;
  emoji?: string;
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
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
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
              backgroundColor: isSelected ? accent : '#fff',
              borderWidth: 2,
              borderColor: isSelected ? accent : 'rgba(0,0,0,0.08)',
            }}
          >
            {option.emoji ? <Text style={{ fontSize: 16 }}>{option.emoji}</Text> : null}
            <Text style={[fw(800), { fontSize: 14, color: isSelected ? '#fff' : colors.navy }]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
