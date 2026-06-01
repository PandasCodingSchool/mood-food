export default function TreatIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M24 6l4 10h10l-8 6 3 10-9-6-9 6 3-10-8-6h10l4-10z" fill="#F59E0B" />
      <circle cx="24" cy="24" r="8" fill="#FBBF24" />
    </svg>
  );
}
