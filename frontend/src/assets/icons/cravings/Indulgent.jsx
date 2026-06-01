export default function IndulgentIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M8 32h32l-4-20H12L8 32z" fill="#A855F7" />
      <ellipse cx="24" cy="32" rx="16" ry="4" fill="#C084FC" />
      <circle cx="18" cy="18" r="3" fill="#E9D5FF" />
      <circle cx="28" cy="16" r="2.5" fill="#F3E8FF" />
    </svg>
  );
}
