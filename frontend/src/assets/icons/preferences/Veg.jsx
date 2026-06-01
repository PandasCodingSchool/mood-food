export default function VegIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#22C55E" />
      <path d="M24 10c-4 8-12 12-12 20a12 12 0 0024 0c0-8-8-12-12-20z" fill="#4ADE80" />
      <path d="M24 14c-2 6-6 9-6 14a6 6 0 0012 0c0-5-4-8-6-14z" fill="#86EFAC" />
    </svg>
  );
}
