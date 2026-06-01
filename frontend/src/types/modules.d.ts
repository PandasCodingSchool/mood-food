declare module "*.jsx" {
  import { ComponentType } from "react";
  const component: ComponentType<unknown>;
  export default component;
}

declare module "../utils/analytics" {
  export function trackEvent(
    eventName: string,
    properties?: Record<string, unknown>,
  ): void;
}

declare module "../../utils/analytics" {
  export function trackEvent(
    eventName: string,
    properties?: Record<string, unknown>,
  ): void;
}

declare module "./utils/analytics" {
  export function trackEvent(
    eventName: string,
    properties?: Record<string, unknown>,
  ): void;
}

// Declare all remaining JSX components
declare module "./components/Hero" {
  const Hero: React.FC<{ onStartQuiz: () => void }>;
  export default Hero;
}

declare module "./components/HowItWorks" {
  const HowItWorks: React.FC;
  export default HowItWorks;
}

declare module "./components/Benefits" {
  const Benefits: React.FC;
  export default Benefits;
}

declare module "./components/Quiz" {
  import type { GameResult } from "./types";
  const Quiz: React.FC<{
    onComplete: (results: GameResult) => void;
    onBack: () => void;
  }>;
  export default Quiz;
}

declare module "./components/Recommendations" {
  import type { QuizResults } from "./types";
  const Recommendations: React.FC<{ results: QuizResults; onBack: () => void }>;
  export default Recommendations;
}

declare module "./components/Waitlist" {
  const Waitlist: React.FC;
  export default Waitlist;
}

declare module "./components/Footer" {
  const Footer: React.FC;
  export default Footer;
}

declare module "./components/Navbar" {
  const Navbar: React.FC<{ onStartQuiz: () => void }>;
  export default Navbar;
}
