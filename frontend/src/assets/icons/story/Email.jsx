export default function EmailIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <rect x="6" y="12" width="36" height="26" rx="4" fill="#0EA5E9" />
      <path d="M6 16l18 12L42 16" fill="#38BDF8" />
      <rect x="10" y="14" width="28" height="4" fill="#7DD3FC" />
    </svg>
  );
}
