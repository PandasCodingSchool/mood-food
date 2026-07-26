import { useState, useEffect, type ComponentProps } from "react";
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
  ThisOrThat,
  CravingRadar,
  Bracket,
  Pantry,
} from "./components/games";
import MoodCheckIn from "./components/MoodCheckIn";
import MindReader from "./components/MindReader";
import Quests from "./components/Quests";
import GroupSession from "./components/GroupSession";
import { trackEvent } from "./utils/analytics";
import { initSession } from "./utils/session";
import { logGameCompletionSignal } from "./utils/signalDispatch";
import { hasCheckedInToday } from "./utils/moodState";
import { fetchLearnedProfile, logSignal } from "./services/signals";
import type { QuizResults, GameResult, LearnedProfile } from "./types";

function App() {
  const [showQuiz, setShowQuiz] = useState(false);
  const [showGameSelector, setShowGameSelector] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [quizResults, setQuizResults] = useState<QuizResults | null>(null);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showMoodCheckIn, setShowMoodCheckIn] = useState(false);
  const [showMindReader, setShowMindReader] = useState(false);
  const [showQuests, setShowQuests] = useState(false);
  const [pendingGameSelector, setPendingGameSelector] = useState(false);
  const [learnedProfile, setLearnedProfile] = useState<LearnedProfile | null>(null);

  useEffect(() => {
    initSession();
    trackEvent("landing_page_viewed");
    fetchLearnedProfile().then(setLearnedProfile).catch(() => {});
  }, []);

  const goToGameSelectorOrMindReader = () => {
    if (learnedProfile?.mode === "mind_reader") {
      setShowMindReader(true);
    } else {
      setShowGameSelector(true);
    }
  };

  const handleStartQuiz = () => {
    trackEvent("quiz_started");
    if (!hasCheckedInToday()) {
      setPendingGameSelector(true);
      setShowMoodCheckIn(true);
    } else {
      goToGameSelectorOrMindReader();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleMoodCheckInDone = () => {
    setShowMoodCheckIn(false);
    if (pendingGameSelector) {
      setPendingGameSelector(false);
      fetchLearnedProfile()
        .then((p) => {
          setLearnedProfile(p);
          if (p?.mode === "mind_reader") setShowMindReader(true);
          else setShowGameSelector(true);
        })
        .catch(() => setShowGameSelector(true));
    }
  };

  const handleMindReaderAccept: ComponentProps<typeof MindReader>["onAccept"] = (
    _rec,
    results,
  ) => {
    const gameResult: GameResult = { ...results, gameData: { type: "mind_reader" } };
    setShowMindReader(false);
    setQuizResults(gameResult);
    setShowRecommendations(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleMindReaderReject = () => {
    setShowMindReader(false);
    setShowGameSelector(true);
  };

  const handleSos = () => {
    logSignal("sos", {});
    trackEvent("sos_used");
    setShowMindReader(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSelectGame = (gameId: string) => {
    setActiveGame(gameId);
    setShowGameSelector(false);
    if (gameId === "quiz") {
      setShowQuiz(true);
    }
  };

  const handleGameComplete = (results: GameResult) => {
    trackEvent("game_completed", { game: activeGame, results });
    logGameCompletionSignal(results);
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
        onSos={handleSos}
        onQuests={() => {
          setShowQuests(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
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

      {showMoodCheckIn ? (
        <MoodCheckIn onDone={handleMoodCheckInDone} />
      ) : showQuests ? (
        <Quests onBack={() => setShowQuests(false)} />
      ) : showMindReader ? (
        <MindReader onAccept={handleMindReaderAccept} onReject={handleMindReaderReject} />
      ) : showGameSelector ? (
        <GameSelector
          onSelectGame={handleSelectGame}
          onBack={handleBackToHome}
        />
      ) : activeGame === "this_or_that" ? (
        <ThisOrThat onComplete={handleGameComplete} onBack={handleBackToGames} />
      ) : activeGame === "craving_radar" ? (
        <CravingRadar onComplete={handleGameComplete} onBack={handleBackToGames} />
      ) : activeGame === "bracket" ? (
        <Bracket onComplete={handleGameComplete} onBack={handleBackToGames} />
      ) : activeGame === "pantry" ? (
        <Pantry onComplete={handleGameComplete} onBack={handleBackToGames} />
      ) : activeGame === "group" ? (
        <GroupSession onBack={handleBackToGames} />
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

      {!showMoodCheckIn &&
        !showQuests &&
        !showMindReader &&
        !showGameSelector &&
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
