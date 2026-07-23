export interface ChipOption {
  id: string;
  label: string;
  emoji?: string;
}

interface ChipSelectorProps {
  options: ChipOption[];
  selected: string[];
  onToggle: (id: string) => void;
  accent?: string;
}

export default function ChipSelector({
  options,
  selected,
  onToggle,
  accent = "#f97316",
}: ChipSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((option) => {
        const isSelected = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onToggle(option.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full border-2 font-extrabold text-sm transition-colors"
            style={{
              backgroundColor: isSelected ? accent : "#fff",
              borderColor: isSelected ? accent : "rgba(0,0,0,0.08)",
              color: isSelected ? "#fff" : "#1a1a2e",
            }}
          >
            {option.emoji && <span>{option.emoji}</span>}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
