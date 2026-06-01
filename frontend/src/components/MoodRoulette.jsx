import { useState, useCallback, useRef, useEffect } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MOOD_OPTIONS } from '../constants/moods';
import {
  SLICE_DEG,
  angleToSpinResult,
  blendFromRouletteSpins,
  formatBetweenLabel,
  randomSpinRotation,
} from '../utils/rouletteEngine';
import { trackEvent } from '../utils/analytics';
import { BlendMoodIcons, MoodIcon } from './icons/Icon';

const SPIN_MS = 2800;

function MoodWheel({ rotation, spinning }) {
  const colors = [
    '#ccfbf1',
    '#e0e7ff',
    '#fecdd3',
    '#c7d2fe',
    '#a7f3d0',
    '#99f6e4',
  ];

  return (
    <div className="relative w-[min(100%,280px)] aspect-square mx-auto">
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10 w-0 h-0"
        style={{
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '18px solid #1f2937',
        }}
        aria-hidden
      />
      <div
        className="w-full h-full rounded-full border-4 border-gray-800 shadow-xl overflow-hidden"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning
            ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`
            : 'none',
        }}
      >
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {MOOD_OPTIONS.map((mood, i) => {
            const startAngle = i * SLICE_DEG - 90;
            const endAngle = (i + 1) * SLICE_DEG - 90;
            const startRad = (startAngle * Math.PI) / 180;
            const endRad = (endAngle * Math.PI) / 180;
            const x1 = 100 + 100 * Math.cos(startRad);
            const y1 = 100 + 100 * Math.sin(startRad);
            const x2 = 100 + 100 * Math.cos(endRad);
            const y2 = 100 + 100 * Math.sin(endRad);
            const large = SLICE_DEG > 180 ? 1 : 0;

            return (
              <path
                key={mood.value}
                d={`M 100 100 L ${x1} ${y1} A 100 100 0 ${large} 1 ${x2} ${y2} Z`}
                fill={colors[i % colors.length]}
                stroke="#fff"
                strokeWidth="1"
              />
            );
          })}
          {MOOD_OPTIONS.map((mood, i) => {
            const midAngle = ((i + 0.5) * SLICE_DEG - 90) * (Math.PI / 180);
            const tx = 100 + 62 * Math.cos(midAngle);
            const ty = 100 + 62 * Math.sin(midAngle);
            const iconSize = 28;
            return (
              <foreignObject
                key={`label-${mood.value}`}
                x={tx - iconSize / 2}
                y={ty - iconSize / 2}
                width={iconSize}
                height={iconSize}
              >
                <div
                  xmlns="http://www.w3.org/1999/xhtml"
                  className="flex h-full w-full items-center justify-center"
                >
                  <MoodIcon mood={mood.icon ?? mood.value} size={iconSize} />
                </div>
              </foreignObject>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function MoodRoulette({ onComplete, onBack }) {
  const [spinIndex, setSpinIndex] = useState(0);
  const [spins, setSpins] = useState([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [blendResult, setBlendResult] = useState(null);
  const [phase, setPhase] = useState('spin'); // spin | result
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    trackEvent('roulette_started');
  }, []);

  const runSpin = useCallback(() => {
    if (spinning) return;

    const targetRotation = rotation + randomSpinRotation();
    const result = angleToSpinResult(targetRotation);

    if (reducedMotion.current) {
      setRotation(targetRotation);
      const nextSpins = [...spins, result];
      setSpins(nextSpins);
      trackEvent('roulette_spin_completed', {
        spin: spinIndex + 1,
        primary: result.primarySlug,
        t: result.t,
      });

      if (nextSpins.length >= 2) {
        const blend = blendFromRouletteSpins(nextSpins[0], nextSpins[1]);
        setBlendResult(blend);
        setPhase('result');
      } else {
        setSpinIndex(1);
      }
      return;
    }

    setSpinning(true);
    setRotation(targetRotation);

    setTimeout(() => {
      setSpinning(false);
      const nextSpins = [...spins, result];
      setSpins(nextSpins);

      trackEvent('roulette_spin_completed', {
        spin: spinIndex + 1,
        primary: result.primarySlug,
        t: result.t,
      });

      if (nextSpins.length >= 2) {
        const blend = blendFromRouletteSpins(nextSpins[0], nextSpins[1]);
        setBlendResult(blend);
        setPhase('result');
      } else {
        setSpinIndex(1);
      }
    }, SPIN_MS);
  }, [spinning, rotation, spins, spinIndex]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && phase === 'spin' && !spinning) {
        e.preventDefault();
        runSpin();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, spinning, runSpin]);

  const handleContinue = () => {
    if (!blendResult) return;
    onComplete({
      mood: blendResult.resultMoodSlug,
      blendContext: blendResult,
      source: 'roulette',
    });
  };

  const handleSpinAgain = () => {
    setSpinIndex(0);
    setSpins([]);
    setBlendResult(null);
    setPhase('spin');
    setRotation(0);
  };

  const spinLabel = spinIndex === 0 ? 'First mood' : 'Second mood';
  const lastSpin = spins[spins.length - 1];
  const betweenLabel = lastSpin ? formatBetweenLabel(lastSpin) : null;

  if (phase === 'result' && blendResult) {
    return (
      <div className="min-h-screen pt-20 pb-10 px-4">
        <div className="max-w-lg mx-auto text-center">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back
          </button>
          <div className="bg-white rounded-3xl shadow-xl p-8 animate-fade-in">
            <p className="text-sm font-medium text-secondary-600 mb-2">Your spin blend</p>
            <div className="mb-4 flex justify-center">
              <MoodIcon mood={blendResult.resultIcon} size={80} className="animate-emoji-morph" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">{blendResult.blendName}</h2>
            <p className="text-gray-600 mb-4">{blendResult.tagline}</p>
            <BlendMoodIcons
              inputMoods={blendResult.inputMoods}
              resultIcon={blendResult.resultIcon}
              size={40}
              className="mb-2"
            />
            {spins.map((s, i) => {
              const between = formatBetweenLabel(s);
              return between ? (
                <p key={i} className="text-xs text-secondary-600 mb-1">
                  Spin {i + 1}: {between}
                </p>
              ) : null;
            })}
            <button type="button" onClick={handleContinue} className="btn-primary w-full text-lg py-4 mt-6 group">
              Lock in craving & budget
              <ArrowRight className="w-5 h-5 ml-2 inline group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              type="button"
              onClick={handleSpinAgain}
              className="text-sm text-gray-500 hover:text-gray-700 mt-3"
            >
              Spin again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-10 px-4">
      <div className="max-w-lg mx-auto">
        <button
          type="button"
          onClick={onBack}
          disabled={spinning}
          className="flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-6 disabled:opacity-50"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>

        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Mood Roulette</h1>
          <p className="text-gray-600 text-sm">
            {spinLabel} — spin {spinIndex + 1} of 2
          </p>
        </div>

        <MoodWheel rotation={rotation} spinning={spinning} />

        {betweenLabel && !spinning && (
          <p className="text-center text-sm text-secondary-600 mt-4">{betweenLabel}</p>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={runSpin}
            disabled={spinning}
            className="btn-secondary text-lg px-10 py-4 disabled:opacity-60"
          >
            {spinning ? 'Spinning…' : `Spin ${spinLabel.toLowerCase()}`}
          </button>
          <p className="text-xs text-gray-500">
            Press Space to spin
            {reducedMotion.current ? ' (motion reduced)' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

export default MoodRoulette;
