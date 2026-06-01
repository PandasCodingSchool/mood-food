/** Simple SVG scenes for Day Story beats — teal / indigo palette */

function SceneFrame({ children, sky = 'morning' }) {
  const skyGradients = {
    morning: ['#ccfbf1', '#e0e7ff', '#f8fafc'],
    lunch: ['#99f6e4', '#ccfbf1', '#f8fafc'],
    evening: ['#c7d2fe', '#e0e7ff', '#f1f5f9'],
  };
  const [c0, c1, c2] = skyGradients[sky] || skyGradients.morning;

  return (
    <svg
      viewBox="0 0 320 180"
      className="w-full h-auto rounded-2xl"
      role="img"
      aria-hidden
    >
      <defs>
        <linearGradient id={`sky-${sky}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={c0} />
          <stop offset="55%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill={`url(#sky-${sky})`} />
      <ellipse cx="160" cy="165" rx="200" ry="28" fill="#5eead4" opacity="0.35" />
      <rect x="0" y="140" width="320" height="40" fill="#2dd4bf" opacity="0.2" />
      {children}
    </svg>
  );
}

export function MorningScene() {
  return (
    <SceneFrame sky="morning">
      <rect x="40" y="70" width="120" height="70" rx="4" fill="#5eead4" opacity="0.9" />
      <rect x="48" y="78" width="104" height="8" fill="#f0fdfa" opacity="0.6" />
      <rect x="48" y="92" width="80" height="6" fill="#f0fdfa" opacity="0.4" />
      <rect x="200" y="55" width="70" height="85" rx="6" fill="#14b8a6" />
      <rect x="210" y="68" width="50" height="35" rx="2" fill="#a5b4fc" opacity="0.7" />
      <circle cx="260" cy="45" r="22" fill="#fde047" opacity="0.9" />
    </SceneFrame>
  );
}

export function LunchScene() {
  return (
    <SceneFrame sky="lunch">
      <rect x="60" y="95" width="200" height="45" rx="6" fill="#0d9488" opacity="0.85" />
      <ellipse cx="100" cy="88" rx="28" ry="12" fill="#fff" opacity="0.9" />
      <ellipse cx="160" cy="88" rx="28" ry="12" fill="#fff" opacity="0.9" />
      <ellipse cx="220" cy="88" rx="28" ry="12" fill="#fff" opacity="0.9" />
      <rect x="130" y="60" width="60" height="8" rx="4" fill="#0f766e" />
      <path d="M 140 60 L 160 40 L 180 60 Z" fill="#115e59" />
    </SceneFrame>
  );
}

export function EveningScene() {
  return (
    <SceneFrame sky="evening">
      <rect x="220" y="75" width="70" height="65" rx="4" fill="#6366f1" opacity="0.5" />
      <rect x="228" y="83" width="54" height="40" rx="2" fill="#e0e7ff" opacity="0.8" />
      <circle cx="80" cy="50" r="8" fill="#fef08a" />
      <circle cx="110" cy="42" r="5" fill="#fef08a" opacity="0.8" />
      <circle cx="140" cy="48" r="6" fill="#fef08a" opacity="0.7" />
      <rect x="30" y="110" width="90" height="35" rx="8" fill="#818cf8" opacity="0.6" />
      <rect x="38" y="118" width="74" height="20" rx="4" fill="#c7d2fe" />
    </SceneFrame>
  );
}

const SCENES = {
  morning: MorningScene,
  lunch: LunchScene,
  evening: EveningScene,
};

export default function StoryScene({ scene }) {
  const Component = SCENES[scene] || MorningScene;
  return <Component />;
}
