export default function ComfortIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <ellipse cx="24" cy="30" rx="16" ry="10" fill="#F59E0B" />
      <path d="M12 30c0-10 5-18 12-18s12 8 12 18" fill="#FBBF24" />
      <ellipse cx="24" cy="28" rx="12" ry="4" fill="#FDE68A" opacity="0.8" />
    </svg>
  );
}
