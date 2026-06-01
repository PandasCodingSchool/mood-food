export default function CouchIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M8 24h32v10c0 3-2 5-6 5H14c-4 0-6-2-6-5V24z" fill="#8B5CF6" />
      <path d="M10 20c0-6 4-10 14-10s14 4 14 10" fill="#A78BFA" />
      <rect x="8" y="34" width="6" height="6" rx="2" fill="#6D28D9" />
      <rect x="34" y="34" width="6" height="6" rx="2" fill="#6D28D9" />
    </svg>
  );
}
