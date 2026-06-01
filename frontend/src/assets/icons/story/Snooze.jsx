export default function SnoozeIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="8" y="14" width="32" height="22" rx="4" fill="#6366F1" />
      <rect x="12" y="18" width="24" height="14" rx="2" fill="#A5B4FC" />
      <path d="M32 8l3 4M38 6l2 3" stroke="#4338CA" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
