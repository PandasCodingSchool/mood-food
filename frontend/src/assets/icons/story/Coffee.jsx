export default function CoffeeIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M12 16h20v18c0 4-3 6-10 6s-10-2-10-6V16z" fill="#92400E" />
      <path d="M32 20h4c3 0 5 2 5 5s-2 5-5 5h-4" stroke="#78350F" strokeWidth="3" fill="none" />
      <path d="M16 10c0-2 2-4 4-4h8c2 0 4 2 4 4" fill="#D97706" />
    </svg>
  );
}
