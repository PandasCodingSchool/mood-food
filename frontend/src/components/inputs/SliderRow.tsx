interface SliderRowProps {
  label: string;
  emojiLow: string;
  emojiHigh: string;
  value: number;
  onChange: (value: number) => void;
  accent?: string;
}

export default function SliderRow({
  label,
  emojiLow,
  emojiHigh,
  value,
  onChange,
  accent = "#f97316",
}: SliderRowProps) {
  return (
    <div className="mb-6">
      <div className="flex justify-between mb-2">
        <span className="font-extrabold text-gray-900 text-sm">{label}</span>
        <span className="font-black text-sm" style={{ color: accent }}>
          {value}/10
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xl">{emojiLow}</span>
        <input
          type="range"
          min={1}
          max={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 rounded-full appearance-none cursor-pointer accent-orange-500"
          style={{ accentColor: accent }}
        />
        <span className="text-xl">{emojiHigh}</span>
      </div>
    </div>
  );
}
