/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        secondary: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'bounce-slow': 'bounce 2s infinite',
        'blender-shake': 'blenderShake 0.45s ease-in-out infinite',
        'emoji-pop': 'emojiPop 0.55s ease-out forwards',
        'emoji-morph': 'emojiMorph 1.8s ease-in-out forwards',
        'jar-swirl': 'jarSwirl 1.2s linear infinite',
        'blend-glow': 'blendGlow 1s ease-in-out infinite alternate',
        'particle-float': 'particleFloat 1.4s ease-in-out infinite',
        'liquid-slosh': 'liquidSlosh 0.8s ease-in-out infinite alternate',
        'liquid-slosh-reverse': 'liquidSloshReverse 1s ease-in-out infinite alternate',
        'emoji-orbit-a': 'emojiOrbitA 1.1s linear infinite',
        'emoji-orbit-b': 'emojiOrbitB 1.3s linear infinite reverse',
        'lid-bounce': 'lidBounce 0.35s ease-in-out infinite',
        'pour-in-left': 'pourInLeft 0.55s ease-in forwards',
        'pour-in-right': 'pourInRight 0.55s ease-in forwards',
        'mix-pulse': 'mixPulse 0.6s ease-in-out infinite',
        'mixer-spin': 'mixerSpin 0.45s linear infinite',
        'mixer-spin-slow': 'mixerSpin 0.7s linear infinite reverse',
        'vortex-spin': 'mixerSpin 1.2s linear infinite',
        'liquid-vortex': 'liquidVortex 0.9s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        blenderShake: {
          '0%, 100%': { transform: 'rotate(0deg) translateY(0)' },
          '20%': { transform: 'rotate(-8deg) translateY(-4px) translateX(-4px)' },
          '40%': { transform: 'rotate(8deg) translateY(2px) translateX(4px)' },
          '60%': { transform: 'rotate(-6deg) translateY(-2px) translateX(-3px)' },
          '80%': { transform: 'rotate(6deg) translateY(3px) translateX(3px)' },
        },
        emojiPop: {
          '0%': { transform: 'scale(0.3) rotate(-20deg)', opacity: '0' },
          '50%': { transform: 'scale(1.25) rotate(8deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        emojiMorph: {
          '0%': { transform: 'scale(0.8)', opacity: '0.6' },
          '40%': { transform: 'scale(1.15)', opacity: '1' },
          '70%': { transform: 'scale(0.95)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        jarSwirl: {
          '0%': { transform: 'rotate(0deg) scale(1)', opacity: '0.5' },
          '50%': { transform: 'rotate(180deg) scale(1.08)', opacity: '0.85' },
          '100%': { transform: 'rotate(360deg) scale(1)', opacity: '0.5' },
        },
        blendGlow: {
          '0%': { opacity: '0.35', transform: 'scale(0.95)' },
          '100%': { opacity: '0.75', transform: 'scale(1.05)' },
        },
        particleFloat: {
          '0%, 100%': { transform: 'translateY(0) scale(1)', opacity: '0.6' },
          '50%': { transform: 'translateY(-12px) scale(1.2)', opacity: '1' },
        },
        liquidSlosh: {
          '0%': { transform: 'translateY(8%) skewX(-4deg) scaleY(1)' },
          '100%': { transform: 'translateY(-12%) skewX(5deg) scaleY(1.08)' },
        },
        liquidSloshReverse: {
          '0%': { transform: 'translateY(-6%) skewX(4deg)' },
          '100%': { transform: 'translateY(10%) skewX(-6deg)' },
        },
        emojiOrbitA: {
          '0%': { transform: 'translate(-28px, 12px) rotate(-15deg) scale(1)' },
          '25%': { transform: 'translate(8px, -20px) rotate(25deg) scale(1.15)' },
          '50%': { transform: 'translate(30px, 8px) rotate(120deg) scale(0.95)' },
          '75%': { transform: 'translate(-6px, 22px) rotate(200deg) scale(1.1)' },
          '100%': { transform: 'translate(-28px, 12px) rotate(360deg) scale(1)' },
        },
        emojiOrbitB: {
          '0%': { transform: 'translate(24px, -8px) rotate(10deg) scale(1.05)' },
          '25%': { transform: 'translate(-12px, 18px) rotate(-40deg) scale(0.9)' },
          '50%': { transform: 'translate(-26px, -12px) rotate(-130deg) scale(1.12)' },
          '75%': { transform: 'translate(18px, 14px) rotate(-220deg) scale(1)' },
          '100%': { transform: 'translate(24px, -8px) rotate(-360deg) scale(1.05)' },
        },
        lidBounce: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-6px) rotate(-2deg)' },
        },
        pourInLeft: {
          '0%': { transform: 'translate(-80px, -60px) scale(1.2) rotate(-25deg)', opacity: '1' },
          '100%': { transform: 'translate(0, 0) scale(0.85) rotate(0deg)', opacity: '1' },
        },
        pourInRight: {
          '0%': { transform: 'translate(80px, -60px) scale(1.2) rotate(25deg)', opacity: '1' },
          '100%': { transform: 'translate(0, 0) scale(0.85) rotate(0deg)', opacity: '1' },
        },
        mixPulse: {
          '0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.03)' },
        },
        mixerSpin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        liquidVortex: {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '50%': { transform: 'rotate(180deg) scale(1.05)' },
          '100%': { transform: 'rotate(360deg) scale(1)' },
        },
      }
    },
  },
  plugins: [],
}
