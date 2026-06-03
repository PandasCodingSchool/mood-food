/** SVG scenes for Day Story — primary orange / secondary purple palette */

import type { ReactNode } from "react";

interface SceneFrameProps {
  children: ReactNode;
  sky: "morning" | "lunch" | "evening";
}

function SceneFrame({ children, sky }: SceneFrameProps) {
  const skyGradients = {
    morning: ["#ffedd5", "#fed7aa", "#fff7ed"],
    lunch: ["#fdba74", "#ffedd5", "#fff7ed"],
    evening: ["#fae8ff", "#f5d0fe", "#fdf4ff"],
  };
  const [c0, c1, c2] = skyGradients[sky];

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
      <ellipse cx="160" cy="165" rx="200" ry="28" fill="#fb923c" opacity="0.25" />
      <rect x="0" y="140" width="320" height="40" fill="#f97316" opacity="0.15" />
      {children}
    </svg>
  );
}

function MorningScene() {
  return (
    <SceneFrame sky="morning">
      <rect x="40" y="70" width="120" height="70" rx="4" fill="#fb923c" opacity="0.85" />
      <rect x="48" y="78" width="104" height="8" fill="#fff7ed" opacity="0.7" />
      <rect x="48" y="92" width="80" height="6" fill="#fff7ed" opacity="0.5" />
      <rect x="200" y="55" width="70" height="85" rx="6" fill="#ea580c" />
      <rect x="210" y="68" width="50" height="35" rx="2" fill="#f0abfc" opacity="0.7" />
      <circle cx="260" cy="45" r="22" fill="#fde047" opacity="0.9" />
    </SceneFrame>
  );
}

function LunchScene() {
  return (
    <SceneFrame sky="lunch">
      <rect x="60" y="95" width="200" height="45" rx="6" fill="#f97316" opacity="0.8" />
      <ellipse cx="100" cy="88" rx="28" ry="12" fill="#fff" opacity="0.9" />
      <ellipse cx="160" cy="88" rx="28" ry="12" fill="#fff" opacity="0.9" />
      <ellipse cx="220" cy="88" rx="28" ry="12" fill="#fff" opacity="0.9" />
      <rect x="130" y="60" width="60" height="8" rx="4" fill="#c2410c" />
      <path d="M 140 60 L 160 40 L 180 60 Z" fill="#9a3412" />
    </SceneFrame>
  );
}

function EveningScene() {
  return (
    <SceneFrame sky="evening">
      <rect x="220" y="75" width="70" height="65" rx="4" fill="#d946ef" opacity="0.45" />
      <rect x="228" y="83" width="54" height="40" rx="2" fill="#fae8ff" opacity="0.85" />
      <circle cx="80" cy="50" r="8" fill="#fde047" />
      <circle cx="110" cy="42" r="5" fill="#fde047" opacity="0.8" />
      <circle cx="140" cy="48" r="6" fill="#fde047" opacity="0.7" />
      <rect x="30" y="110" width="90" height="35" rx="8" fill="#e879f9" opacity="0.55" />
      <rect x="38" y="118" width="74" height="20" rx="4" fill="#f5d0fe" />
    </SceneFrame>
  );
}

const SCENES = {
  morning: MorningScene,
  lunch: LunchScene,
  evening: EveningScene,
};

interface StorySceneProps {
  scene: "morning" | "lunch" | "evening";
}

export default function StoryScene({ scene }: StorySceneProps) {
  const Component = SCENES[scene] || MorningScene;
  return <Component />;
}
