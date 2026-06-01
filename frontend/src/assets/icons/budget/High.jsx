export default function HighBudgetIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="14" cy="28" r="11" fill="#818CF8" />
      <circle cx="24" cy="24" r="12" fill="#6366F1" />
      <circle cx="34" cy="20" r="13" fill="#4F46E5" />
      <path d="M34 14h-5c-1.5 0-2.5 1-2.5 2.2s1.5 2.3 3 2.3 3 0.8 3 2.2-1.5 2.3-4 2.3" stroke="#312E81" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </svg>
  );
}
