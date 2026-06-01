import { UtensilsCrossed } from 'lucide-react';

function Navbar({ onOpenPlay, onStartQuiz }) {
  return (
    <nav className="app-navbar fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b animate-fade-in font-sans">
      <div className="section-container">
        <div className="flex items-center justify-between h-16">
          <a href="/" className="flex items-center space-x-2 group">
            <div className="app-navbar__logo w-10 h-10 rounded-xl flex items-center justify-center transition-colors">
              <UtensilsCrossed className="w-6 h-6 text-white" />
            </div>
            <span className="app-navbar__brand text-xl font-bold tracking-tight">MoodFood</span>
          </a>

          <div className="hidden md:flex items-center space-x-6">
            <a href="#how-it-works" className="text-slate-600 hover:text-primary-600 transition-colors text-sm font-medium">
              How It Works
            </a>
            <a href="#benefits" className="text-slate-600 hover:text-primary-600 transition-colors text-sm font-medium">
              Benefits
            </a>
            <a href="#waitlist" className="text-secondary-600 hover:text-secondary-700 transition-colors text-sm font-medium">
              Join waitlist
            </a>
            <button type="button" onClick={onStartQuiz} className="btn-outline text-sm py-2 px-4">
              Quick quiz
            </button>
            <button type="button" onClick={onOpenPlay} className="btn-primary text-sm py-2 px-5">
              Play
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
