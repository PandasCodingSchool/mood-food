export default function LightIcon({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <path d="M24 8c-6 10-14 14-14 24a14 14 0 0028 0c0-10-8-14-14-24z" fill="#2DD4BF" />
      <path d="M24 20v16M18 28h12" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
