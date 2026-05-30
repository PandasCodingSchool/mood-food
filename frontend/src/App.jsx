import { useState, useEffect } from 'react'
import Hero from './components/Hero'
import HowItWorks from './components/HowItWorks'
import Benefits from './components/Benefits'
import Quiz from './components/Quiz'
import Recommendations from './components/Recommendations'
import Waitlist from './components/Waitlist'
import Footer from './components/Footer'
import Navbar from './components/Navbar'
import { trackEvent } from './utils/analytics'

function App() {
  const [showQuiz, setShowQuiz] = useState(false)
  const [quizResults, setQuizResults] = useState(null)
  const [showRecommendations, setShowRecommendations] = useState(false)

  useEffect(() => {
    trackEvent('landing_page_viewed')
  }, [])

  const handleStartQuiz = () => {
    trackEvent('quiz_started')
    setShowQuiz(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleQuizComplete = (results) => {
    trackEvent('quiz_completed')
    setQuizResults(results)
    setShowQuiz(false)
    setShowRecommendations(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBackToHome = () => {
    setShowQuiz(false)
    setShowRecommendations(false)
    setQuizResults(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-purple-50">
      <Navbar onStartQuiz={handleStartQuiz} />
      
      {showQuiz ? (
        <Quiz onComplete={handleQuizComplete} onBack={handleBackToHome} />
      ) : showRecommendations ? (
        <Recommendations results={quizResults} onBack={handleBackToHome} />
      ) : (
        <main>
          <Hero onStartQuiz={handleStartQuiz} />
          <HowItWorks />
          <Benefits />
          <Waitlist />
        </main>
      )}
      
      {!showQuiz && !showRecommendations && <Footer />}
    </div>
  )
}

export default App
