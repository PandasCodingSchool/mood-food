export default function TiredIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#93C5FD" />
      <path d="M14 20h8M26 20h8" stroke="#1E3A8A" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="24" cy="32" rx="6" ry="3" fill="#1E3A8A" opacity="0.5" />
      <path d="M30 10c2 2 4 6 2 8" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
