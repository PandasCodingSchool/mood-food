export default function NonVegIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#F87171" />
      <path d="M14 20c0-6 4-10 10-10s10 4 10 10-4 14-10 14" fill="#EA580C" />
      <ellipse cx="20" cy="22" rx="4" ry="6" fill="#C2410C" transform="rotate(-20 20 22)" />
    </svg>
  );
}
