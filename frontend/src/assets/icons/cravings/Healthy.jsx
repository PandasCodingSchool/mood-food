export default function HealthyIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <ellipse cx="24" cy="32" rx="18" ry="8" fill="#22C55E" />
      <path d="M14 32c4-14 8-18 10-22 2 4 6 8 10 22M26 32c2-10 6-16 10-20 4 4 8 10 10 20" fill="#4ADE80" />
      <circle cx="18" cy="18" r="4" fill="#86EFAC" />
      <circle cx="30" cy="16" r="3" fill="#BBF7D0" />
    </svg>
  );
}
