export default function StillWorkingIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="10" y="8" width="28" height="20" rx="2" fill="#64748B" />
      <rect x="12" y="10" width="24" height="16" fill="#94A3B8" />
      <path d="M14 28h20v8H14z" fill="#475569" />
      <circle cx="36" cy="12" r="4" fill="#EF4444" />
    </svg>
  );
}
