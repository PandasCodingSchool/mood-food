import { UtensilsCrossed } from 'lucide-react';

function Navbar({ onStartQuiz }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="section-container">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-xl flex items-center justify-center">
              <UtensilsCrossed className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
              MoodFood
            </span>
          </div>
          
          <div className="hidden md:flex items-center space-x-8">
            <a href="#how-it-works" className="text-gray-600 hover:text-primary-600 transition-colors">
              How It Works
            </a>
            <a href="#benefits" className="text-gray-600 hover:text-primary-600 transition-colors">
              Benefits
            </a>
            <button onClick={onStartQuiz} className="btn-primary">
              Find My Meal
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
