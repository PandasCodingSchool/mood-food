import { useState } from "react";
import {
  Gamepad2,
  ChevronRight,
  MessageCircle,
  Sparkles,
  RotateCw,
} from "lucide-react";
import { trackEvent } from "../utils/analytics";
import type { LucideIcon } from "lucide-react";

interface Game {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  duration: string;
}

const GAMES: Game[] = [
  {
    id: "quiz",
    title: "Classic Quiz",
    description: "Answer 4 questions about your mood and cravings",
    icon: MessageCircle,
    color: "from-blue-500 to-cyan-500",
    bgColor: "bg-blue-50",
    duration: "~1 min",
  },
  {
    id: "swipe",
    title: "Swipe & Vibe",
    description: "Tinder-style swiping on food images. Quick & fun!",
    icon: Sparkles,
    color: "from-pink-500 to-purple-500",
    bgColor: "bg-pink-50",
    duration: "~30 sec",
  },
  {
    id: "wheel",
    title: "Spin the Wheel",
    description: "Spin and decide. Rejections tell us as much as acceptances!",
    icon: RotateCw,
    color: "from-orange-500 to-yellow-500",
    bgColor: "bg-orange-50",
    duration: "~45 sec",
  },
];

interface GameSelectorProps {
  onSelectGame: (gameId: string) => void;
  onBack: () => void;
}

function GameSelector({ onSelectGame, onBack }: GameSelectorProps) {
  const [hoveredGame, setHoveredGame] = useState<string | null>(null);

  const handleSelect = (gameId: string) => {
    trackEvent("game_selected", { game: gameId });
    onSelectGame(gameId);
  };

  return (
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <button
            onClick={onBack}
            className="inline-flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            ← Back to Home
          </button>
          <br />

          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl mb-4">
            <Gamepad2 className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Choose Your Adventure
          </h2>
          <p className="text-gray-600 max-w-md mx-auto">
            Pick a game style to help us understand your mood and recommend the
            perfect meal
          </p>
        </div>

        <div className="space-y-4">
          {GAMES.map((game) => {
            const Icon = game.icon;
            const isHovered = hoveredGame === game.id;

            return (
              <button
                key={game.id}
                onClick={() => handleSelect(game.id)}
                onMouseEnter={() => setHoveredGame(game.id)}
                onMouseLeave={() => setHoveredGame(null)}
                className={`w-full p-6 rounded-2xl transition-all duration-300 text-left group ${
                  isHovered ? "scale-[1.02] shadow-xl" : "shadow-md"
                } ${game.bgColor}`}
              >
                <div className="flex items-center">
                  <div
                    className={`w-14 h-14 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center flex-shrink-0 mr-4`}
                  >
                    <Icon className="w-7 h-7 text-white" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-xl font-bold text-gray-900">
                        {game.title}
                      </h3>
                      <span className="text-xs font-medium text-gray-500 bg-white/70 px-2 py-1 rounded-full">
                        {game.duration}
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm">{game.description}</p>
                  </div>

                  <ChevronRight
                    className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${
                      isHovered ? "translate-x-1 text-gray-600" : ""
                    }`}
                  />
                </div>

                <div
                  className={`mt-3 text-sm font-medium bg-gradient-to-r ${game.color} bg-clip-text text-transparent transition-opacity duration-300 ${
                    isHovered ? "opacity-100" : "opacity-0"
                  }`}
                >
                  Click to play →
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-center text-gray-400 text-sm mt-8">
          All games give equally good recommendations. Pick what sounds fun!
        </p>
      </div>
    </div>
  );
}

export default GameSelector;
