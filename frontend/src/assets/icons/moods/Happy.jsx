export default function HappyIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#FCD34D" />
      <circle cx="17" cy="20" r="2.5" fill="#78350F" />
      <circle cx="31" cy="20" r="2.5" fill="#78350F" />
      <path d="M16 30c3 4 13 4 16 0" stroke="#78350F" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
