export default function TeamLunchIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <ellipse cx="24" cy="32" rx="18" ry="8" fill="#F59E0B" />
      <circle cx="14" cy="20" r="6" fill="#FBBF24" />
      <circle cx="24" cy="18" r="6" fill="#FCD34D" />
      <circle cx="34" cy="20" r="6" fill="#FBBF24" />
    </svg>
  );
}
