import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

interface NavbarProps {
  onStartQuiz: () => void;
  onJoinWaitlist?: () => void;
  onHome?: () => void;
}

function Navbar({ onStartQuiz, onJoinWaitlist, onHome }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleWaitlist = () => {
    setMenuOpen(false);
    if (onJoinWaitlist) {
      onJoinWaitlist();
    } else {
      document
        .getElementById("waitlist")
        ?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleStart = () => {
    setMenuOpen(false);
    onStartQuiz();
  };

  const handleHome = () => {
    setMenuOpen(false);
    if (onHome) {
      onHome();
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-md shadow-md border-b border-gray-100"
          : "bg-white/80 backdrop-blur-md border-b border-gray-100"
      }`}
    >
      <div className="section-container">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <button
            type="button"
            className="flex items-center space-x-2 cursor-pointer"
            onClick={handleHome}
            aria-label="Go to home"
          >
            <img
              src="/MoodFood.png"
              alt="MoodFood"
              className="h-16 w-auto rounded-xl object-contain"
            />
          </button>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center space-x-6">
            <a
              href="#how-it-works"
              className="text-gray-600 hover:text-primary-600 transition-colors text-sm font-medium"
            >
              How It Works
            </a>
            <a
              href="#benefits"
              className="text-gray-600 hover:text-primary-600 transition-colors text-sm font-medium"
            >
              Benefits
            </a>
            <button
              onClick={handleWaitlist}
              className="px-4 py-2 text-sm font-medium text-primary-600 border border-primary-300 rounded-full hover:bg-primary-50 transition-all"
            >
              Join Waitlist
            </button>
            <button
              onClick={handleStart}
              className="btn-primary text-sm px-5 py-2.5"
            >
              Find My Meal
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ${
          menuOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        } bg-white border-t border-gray-100`}
      >
        <div className="section-container py-4 flex flex-col gap-3">
          <a
            href="#how-it-works"
            onClick={() => setMenuOpen(false)}
            className="text-gray-700 font-medium py-2 hover:text-primary-600 transition-colors"
          >
            How It Works
          </a>
          <a
            href="#benefits"
            onClick={() => setMenuOpen(false)}
            className="text-gray-700 font-medium py-2 hover:text-primary-600 transition-colors"
          >
            Benefits
          </a>
          <button
            onClick={handleWaitlist}
            className="w-full py-3 text-sm font-medium text-primary-600 border border-primary-300 rounded-full hover:bg-primary-50 transition-all"
          >
            Join Waitlist
          </button>
          <button onClick={handleStart} className="btn-primary w-full">
            Find My Meal
          </button>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
