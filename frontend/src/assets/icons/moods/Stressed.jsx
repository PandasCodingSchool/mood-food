export default function StressedIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#FCA5A5" />
      <path d="M16 18l4 4M32 18l-4 4M16 26l4-4M32 26l-4-4" stroke="#991B1B" strokeWidth="2" strokeLinecap="round" />
      <path d="M18 32c2 2 10 2 12 0" stroke="#991B1B" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
