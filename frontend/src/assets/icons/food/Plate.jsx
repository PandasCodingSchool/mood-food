export default function PlateIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <ellipse cx="24" cy="28" rx="18" ry="10" fill="#E2E8F0" />
      <ellipse cx="24" cy="26" rx="14" ry="7" fill="#F8FAFC" />
      <path d="M16 20c2-4 6-6 8-6s6 2 8 6" fill="#14B8A6" />
      <circle cx="28" cy="18" r="4" fill="#F87171" />
      <circle cx="20" cy="22" r="3" fill="#FBBF24" />
    </svg>
  );
}
