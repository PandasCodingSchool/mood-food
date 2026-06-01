export default function DeskIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="8" y="22" width="32" height="6" rx="1" fill="#64748B" />
      <rect x="20" y="28" width="8" height="12" fill="#475569" />
      <rect x="12" y="14" width="24" height="14" rx="2" fill="#94A3B8" />
      <rect x="14" y="16" width="20" height="10" fill="#CBD5E1" />
    </svg>
  );
}
