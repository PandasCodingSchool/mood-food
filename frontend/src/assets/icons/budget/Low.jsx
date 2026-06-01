export default function LowBudgetIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="20" fill="#22C55E" />
      <circle cx="24" cy="24" r="14" fill="#4ADE80" />
      <path d="M28 18h-6c-2 0-3 1-3 3s2 3 4 3 4 1 4 3-2 3-5 3" stroke="#14532D" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M24 14v3M24 33v3" stroke="#14532D" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
