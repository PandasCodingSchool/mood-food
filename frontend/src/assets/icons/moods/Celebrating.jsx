export default function CelebratingIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#C4B5FD" />
      <circle cx="17" cy="20" r="2.5" fill="#5B21B6" />
      <circle cx="31" cy="20" r="2.5" fill="#5B21B6" />
      <path d="M16 28c3 5 13 5 16 0" stroke="#5B21B6" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M8 12l2 4M40 12l-2 4M24 4v4" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
