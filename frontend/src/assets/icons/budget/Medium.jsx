export default function MediumBudgetIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="18" cy="26" r="14" fill="#EAB308" opacity="0.9" />
      <circle cx="30" cy="22" r="14" fill="#FACC15" />
      <path d="M30 16h-5c-1.5 0-2.5 1-2.5 2.2s1.5 2.3 3 2.3 3 0.8 3 2.2-1.5 2.3-4 2.3" stroke="#713F12" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
