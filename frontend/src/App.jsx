import { useState, useEffect } from 'react'
import Hero from './components/Hero'
import HowItWorks from './components/HowItWorks'
import Benefits from './components/Benefits'
import Quiz from './components/Quiz'
import MoodBlender from './components/MoodBlender'
import PlayHub from './components/PlayHub'
import DayStory from './components/DayStory'
import MoodRoulette from './components/MoodRoulette'
import ThemedFollowUp from './components/ThemedFollowUp'
import Recommendations from './components/Recommendations'
import Waitlist from './components/Waitlist'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import { trackEvent } from './utils/analytics'
import { isWaitlistJoined } from './utils/waitlist'

async function recordQuizCompletion(results) {
  try {
    await fetch('/api/quiz-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mood: results.mood,
        craving: results.craving,
        budget: results.budget,
        preference: results.preference,
        source: results.source || 'quiz',
      }),
    })
  } catch {
    // non-blocking
  }
}

function App() {
  const [view, setView] = useState('home')
  const [quizResults, setQuizResults] = useState(null)
  const [gameContext, setGameContext] = useState(null)
  const [blenderSlots, setBlenderSlots] = useState(null)
  const [blenderRestore, setBlenderRestore] = useState(null)
  const [waitlistJoined, setWaitlistJoined] = useState(() => isWaitlistJoined())

  useEffect(() => {
    trackEvent('landing_page_viewed')
  }, [])

  const handleWaitlistJoined = () => setWaitlistJoined(true)

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  const handleBackToHome = () => {
    setView('home')
    setQuizResults(null)
    setGameContext(null)
    setBlenderSlots(null)
    setBlenderRestore(null)
  }

  const handleOpenPlayHub = () => {
    trackEvent('play_hub_opened')
    setView('playHub')
    scrollTop()
  }

  const handleStartQuiz = () => {
    trackEvent('quiz_started', { mode: 'full', source: 'quiz' })
    setGameContext(null)
    setView('quiz')
    scrollTop()
  }

  const handleSelectMode = (modeId) => {
    setGameContext(null)
    setBlenderSlots(null)
    setBlenderRestore(null)

    if (modeId === 'quiz') {
      trackEvent('quiz_started', { mode: 'full', source: 'playHub' })
      setView('quiz')
    } else if (modeId === 'blender') {
      trackEvent('blender_started')
      setView('blender')
    } else if (modeId === 'story') {
      setView('story')
    } else if (modeId === 'roulette') {
      setView('roulette')
    }
    scrollTop()
  }

  const handleGameComplete = (ctx) => {
    setGameContext(ctx)
    setView('followUp')
    scrollTop()
  }

  const handleBlenderComplete = (blendResult) => {
    trackEvent('blender_to_followup', {
      resultMoodSlug: blendResult.resultMoodSlug,
      blendName: blendResult.blendName,
    })
    handleGameComplete({
      mood: blendResult.resultMoodSlug,
      blendContext: blendResult,
      source: 'blender',
    })
  }

  const handleQuizComplete = (results) => {
    const full = { ...results, source: results.source || 'quiz' }
    trackEvent('quiz_completed', { mode: 'full', source: full.source })
    recordQuizCompletion(full)
    setQuizResults(full)
    setView('recommendations')
    scrollTop()
  }

  const handleFollowUpComplete = (results) => {
    trackEvent('journey_completed', { source: results.source })
    recordQuizCompletion(results)
    setQuizResults(results)
    setGameContext(null)
    setView('recommendations')
    scrollTop()
  }

  const handleFollowUpBack = () => {
    const src = gameContext?.source
    if (src === 'story') setView('story')
    else if (src === 'roulette') setView('roulette')
    else if (src === 'blender') {
      setView('blender')
      if (gameContext?.blendContext) {
        setBlenderRestore(gameContext.blendContext)
        setBlenderSlots({
          'slot-a': gameContext.blendContext.inputMoods[0]?.value ?? null,
          'slot-b': gameContext.blendContext.inputMoods[1]?.value ?? null,
        })
      }
    } else {
      handleBackToHome()
    }
    scrollTop()
  }

  const handleBlenderBack = () => {
    if (view === 'blender') {
      setView('playHub')
      scrollTop()
    } else {
      handleBackToHome()
    }
  }

  const handleStoryBack = () => {
    setView('playHub')
    scrollTop()
  }

  const handleRouletteBack = () => {
    setView('playHub')
    scrollTop()
  }

  const handlePlayHubBack = () => {
    handleBackToHome()
  }

  const handleQuizBack = () => {
    if (view === 'quiz') {
      setView('playHub')
      scrollTop()
    }
  }

  const isOverlay = view !== 'home'

  return (
    <div
      className={`min-h-screen ${
        view === 'home'
          ? 'landing-page bg-gradient-to-b from-[rgb(var(--color-primary-50))] via-white to-[rgb(var(--color-secondary-50))]'
          : 'bg-slate-50'
      }`}
    >
      <Navbar onOpenPlay={handleOpenPlayHub} onStartQuiz={handleStartQuiz} />

      {view === 'quiz' ? (
        <Quiz onComplete={handleQuizComplete} onBack={handleQuizBack} />
      ) : view === 'blender' ? (
        <MoodBlender
          onComplete={handleBlenderComplete}
          onBack={handleBlenderBack}
          initialSlots={blenderSlots}
          initialBlendResult={blenderRestore}
        />
      ) : view === 'playHub' ? (
        <PlayHub onSelectMode={handleSelectMode} onBack={handlePlayHubBack} />
      ) : view === 'story' ? (
        <DayStory onComplete={handleGameComplete} onBack={handleStoryBack} />
      ) : view === 'roulette' ? (
        <MoodRoulette onComplete={handleGameComplete} onBack={handleRouletteBack} />
      ) : view === 'followUp' && gameContext ? (
        <ThemedFollowUp
          source={gameContext.source}
          mood={gameContext.mood}
          blendContext={gameContext.blendContext}
          storySummary={gameContext.storySummary}
          onComplete={handleFollowUpComplete}
          onBack={handleFollowUpBack}
        />
      ) : view === 'recommendations' && quizResults ? (
        <Recommendations results={quizResults} onBack={handleBackToHome} />
      ) : (
        <main className="landing-page">
          <Hero
            onOpenPlayHub={handleOpenPlayHub}
            onStartQuiz={handleStartQuiz}
            waitlistJoined={waitlistJoined}
            onWaitlistJoined={handleWaitlistJoined}
          />
          <HowItWorks />
          <Benefits />
          <Waitlist joined={waitlistJoined} onJoined={handleWaitlistJoined} />
        </main>
      )}

      {!isOverlay && <Footer />}
    </div>
  )
}

export default App
