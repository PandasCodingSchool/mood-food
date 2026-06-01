export default function BothIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="4" y="8" width="40" height="32" rx="6" fill="#60A5FA" />
      <ellipse cx="24" cy="32" rx="14" ry="5" fill="#3B82F6" />
      <circle cx="16" cy="20" r="5" fill="#FDE68A" />
      <circle cx="30" cy="18" r="4" fill="#FCA5A5" />
    </svg>
  );
}
