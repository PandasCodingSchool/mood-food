export default function AdventurousIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#5EEAD4" />
      <circle cx="17" cy="20" r="3" fill="#134E4A" />
      <circle cx="31" cy="20" r="3" fill="#134E4A" />
      <circle cx="17" cy="19" r="1" fill="#fff" />
      <circle cx="31" cy="19" r="1" fill="#fff" />
      <path d="M16 30c4 6 12 6 16 0" stroke="#134E4A" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
