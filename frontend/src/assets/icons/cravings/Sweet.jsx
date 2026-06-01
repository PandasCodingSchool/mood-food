export default function SweetIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M10 28c0-8 6-14 14-14s14 6 14 14-6 14-14 14H10z" fill="#F9A8D4" />
      <ellipse cx="24" cy="30" rx="10" ry="6" fill="#F472B6" />
      <path d="M16 20c2-4 4-4 8 0M28 18c2-4 6-4 8 0" stroke="#9D174D" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
