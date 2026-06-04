import { useState } from "react";
import {
  Gamepad2,
  ChevronRight,
  IceCreamBowl,
  Sandwich,
  CircleDotDashed,
  BookOpen,
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
  tag: string;
  emoji: string;
}

const GAMES: Game[] = [
  {
    id: "story",
    title: "Day Story",
    description: "Live a mini workday — we read your mood from your choices",
    icon: BookOpen,
    color: "from-primary-500 to-secondary-500",
    bgColor: "bg-primary-50",
    duration: "~45 sec",
    tag: "Story mode",
    emoji: "📖",
  },
  {
    id: "quiz",
    title: "Mood Scoop",
    description:
      "Scoop your mood with quick questions about cravings and budget",
    icon: IceCreamBowl,
    color: "from-blue-500 to-violet-500",
    bgColor: "bg-blue-50",
    duration: "~1 min",
    tag: "Classic",
    emoji: "🍦",
  },
  {
    id: "swipe",
    title: "Snack Match",
    description: "Swipe food cards left or right until your cravings click",
    icon: Sandwich,
    color: "from-pink-500 to-rose-500",
    bgColor: "bg-pink-50",
    duration: "~30 sec",
    tag: "Fastest",
    emoji: "🥪",
  },
  {
    id: "wheel",
    title: "Meal Roulette",
    description: "Spin for a meal vibe, accept the winner, or roll again",
    icon: CircleDotDashed,
    color: "from-orange-500 to-amber-500",
    bgColor: "bg-orange-50",
    duration: "~45 sec",
    tag: "Surprise me",
    emoji: "🎡",
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
    <div className="min-h-screen pt-20 pb-10 px-4 bg-gradient-to-br from-primary-50 via-white to-secondary-50 relative overflow-hidden">
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-primary-200 rounded-full blur-3xl opacity-40 blob-drift" />
      <div
        className="absolute top-48 -left-24 w-64 h-64 bg-secondary-200 rounded-full blur-3xl opacity-30 blob-drift"
        style={{ animationDelay: "1.5s" }}
      />
      <div className="absolute bottom-12 right-8 text-5xl opacity-10 animate-bounce">
        🍕
      </div>
      <div className="absolute top-28 left-8 text-4xl opacity-10 animate-pulse">
        🍜
      </div>

      <div className="max-w-2xl mx-auto relative">
        <div className="text-center mb-10 animate-slide-up">
          <button
            onClick={onBack}
            className="inline-flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6 bg-white/70 backdrop-blur-sm border border-white/80 rounded-full px-4 py-2 shadow-sm hover:shadow-md"
          >
            ← Back to Home
          </button>
          <br />

          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl mb-4 shadow-xl shadow-primary-200/70 animate-pulse">
            <Gamepad2 className="w-8 h-8 text-white" />
          </div>

          <h2 className="text-3xl md:text-5xl font-black text-gray-900 mb-3 tracking-tight">
            Choose Your{" "}
            <span className="bg-gradient-to-r from-primary-500 to-secondary-500 bg-clip-text text-transparent">
              Adventure
            </span>
          </h2>
          <p className="text-gray-600 max-w-md mx-auto">
            Pick a game style to help us understand your mood and recommend the
            perfect meal
          </p>
        </div>

        <div className="space-y-4">
          {GAMES.map((game, index) => {
            const Icon = game.icon;
            const isHovered = hoveredGame === game.id;

            return (
              <button
                key={game.id}
                onClick={() => handleSelect(game.id)}
                onMouseEnter={() => setHoveredGame(game.id)}
                onMouseLeave={() => setHoveredGame(null)}
                className={`w-full p-[1px] rounded-3xl transition-all duration-300 text-left group bg-gradient-to-r ${game.color} ${
                  isHovered
                    ? "scale-[1.02] shadow-2xl shadow-primary-200/40"
                    : "shadow-md shadow-gray-200/70"
                } animate-slide-up`}
                style={{ animationDelay: `${index * 0.08}s` }}
              >
                <div
                  className={`rounded-3xl p-5 md:p-6 ${game.bgColor} bg-white/90 backdrop-blur-sm relative overflow-hidden`}
                >
                  <div className="absolute -right-4 -top-6 text-7xl opacity-70 group-hover:opacity-90 group-hover:rotate-12 transition-all duration-300">
                    {game.emoji}
                  </div>
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-white/0 via-white/50 to-white/0" />

                  <div className="relative flex items-center">
                    <div
                      className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${game.color} flex items-center justify-center flex-shrink-0 mr-4 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300`}
                    >
                      <Icon className="w-8 h-8 text-white" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <div>
                          <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider text-gray-500 bg-white/80 border border-white px-2 py-1 rounded-full mb-2">
                            {game.tag}
                          </span>
                          <h3 className="text-xl md:text-2xl font-black text-gray-900 leading-tight">
                            {game.title}
                          </h3>
                        </div>
                        <span className="text-xs font-bold text-gray-500 bg-white/80 px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
                          {game.duration}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm leading-relaxed">
                        {game.description}
                      </p>
                    </div>

                    <ChevronRight
                      className={`w-6 h-6 text-gray-400 ml-3 transition-all duration-300 ${
                        isHovered ? "translate-x-1 text-gray-700 scale-110" : ""
                      }`}
                    />
                  </div>

                  <div
                    className={`relative mt-4 flex items-center justify-between transition-all duration-300 ${
                      isHovered
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-2"
                    }`}
                  >
                    <span
                      className={`text-sm font-black bg-gradient-to-r ${game.color} bg-clip-text text-transparent`}
                    >
                      Click to play →
                    </span>
                    <span className="text-xs text-gray-400">
                      AI reads your food vibe
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <p
          className="text-center text-gray-400 text-sm mt-8 animate-slide-up"
          style={{ animationDelay: "0.35s" }}
        >
          All games give equally good recommendations. Pick what sounds fun!
        </p>
      </div>
    </div>
  );
}

export default GameSelector;
