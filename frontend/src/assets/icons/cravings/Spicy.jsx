export default function SpicyIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M24 4c-2 8-8 12-8 20a8 8 0 1016 0c0-8-6-12-8-20z" fill="#EF4444" />
      <path d="M24 18c0 4-2 6-2 10a6 6 0 0012 0c0-4-2-6-2-10" fill="#FCA5A5" />
    </svg>
  );
}
