export default function RelaxedIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#86EFAC" />
      <path d="M16 20c2-2 14-2 16 0" stroke="#14532D" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M18 30c2 2 10 2 12 0" stroke="#14532D" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
