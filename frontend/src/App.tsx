import { useState, useEffect } from "react";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import Benefits from "./components/Benefits";
import Quiz from "./components/Quiz";
import Recommendations from "./components/Recommendations";
import Waitlist from "./components/Waitlist";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar.tsx";
import GameSelector from "./components/GameSelector";
import About from "./components/About";
import Contact from "./components/Contact";
import {
  SwipeVibe,
  SpinWheel,
  DayStory,
  CharacterMatch,
} from "./components/games";
import { trackEvent } from "./utils/analytics";
import type { QuizResults, GameData } from "./types";

function App() {
  const [showQuiz, setShowQuiz] = useState(false);
  const [showGameSelector, setShowGameSelector] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [quizResults, setQuizResults] = useState<QuizResults | null>(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showContact, setShowContact] = useState(false);

  useEffect(() => {
    trackEvent("landing_page_viewed");
  }, []);

  const handleStartQuiz = () => {
    trackEvent("quiz_started");
    setShowGameSelector(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectGame = (gameId: string) => {
    setActiveGame(gameId);
    setShowGameSelector(false);
    if (gameId === "quiz") {
      setShowQuiz(true);
    }
  };

  const handleGameComplete = (
    results: QuizResults & { gameData: GameData },
  ) => {
    trackEvent("game_completed", { game: activeGame, results });
    setQuizResults(results);
    setActiveGame(null);
    setShowQuiz(false);
    setShowRecommendations(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToGames = () => {
    setActiveGame(null);
    setShowQuiz(false);
    setShowGameSelector(true);
  };

  const handleBackToHome = () => {
    setShowQuiz(false);
    setShowGameSelector(false);
    setActiveGame(null);
    setShowRecommendations(false);
    setShowAbout(false);
    setShowContact(false);
    setQuizResults(null);
  };

  const handleShowAbout = () => {
    setShowAbout(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleShowContact = () => {
    setShowContact(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <Navbar
        onStartQuiz={handleStartQuiz}
        onHome={() => {
          handleBackToHome();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onJoinWaitlist={() => {
          handleBackToHome();
          setTimeout(
            () =>
              document
                .getElementById("waitlist")
                ?.scrollIntoView({ behavior: "smooth" }),
            100,
          );
        }}
      />

      {showGameSelector ? (
        <GameSelector
          onSelectGame={handleSelectGame}
          onBack={handleBackToHome}
        />
      ) : activeGame === "story" ? (
        <DayStory onComplete={handleGameComplete} onBack={handleBackToGames} />
      ) : activeGame === "character" ? (
        <CharacterMatch
          onComplete={handleGameComplete}
          onBack={handleBackToGames}
        />
      ) : activeGame === "swipe" ? (
        <SwipeVibe onComplete={handleGameComplete} onBack={handleBackToGames} />
      ) : activeGame === "wheel" ? (
        <SpinWheel onComplete={handleGameComplete} onBack={handleBackToGames} />
      ) : showQuiz ? (
        <Quiz onComplete={handleGameComplete} onBack={handleBackToGames} />
      ) : showAbout ? (
        <About onBack={handleBackToHome} />
      ) : showContact ? (
        <Contact onBack={handleBackToHome} />
      ) : showRecommendations && quizResults ? (
        <Recommendations results={quizResults} onBack={handleBackToHome} />
      ) : (
        <main>
          <Hero onStartQuiz={handleStartQuiz} />
          <HowItWorks />
          <Benefits />
          <Waitlist />
        </main>
      )}

      {!showGameSelector &&
        !activeGame &&
        !showQuiz &&
        !showRecommendations &&
        !showAbout &&
        !showContact && (
          <Footer onAbout={handleShowAbout} onContact={handleShowContact} />
        )}
    </div>
  );
}

export default App;
