export default function SkipIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="20" fill="#94A3B8" />
      <path d="M18 16l12 8-12 8V16z" fill="#F8FAFC" />
    </svg>
  );
}
