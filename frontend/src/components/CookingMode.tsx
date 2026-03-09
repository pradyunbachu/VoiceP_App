import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Mic, MicOff, Volume2, VolumeX, ChefHat, Loader } from 'lucide-react';
import { useWebSpeechRecognition } from '../hooks/useWebSpeechRecognition';
import { useCookingCommands, type CookingCommand } from '../hooks/useCookingCommands';
import type { ShowToast } from '../types';
import './CookingMode.css';

interface RecipeIngredient {
  amount: string;
  item: string;
}

interface RecipeData {
  name: string;
  description?: string;
  servings?: number;
  prep_minutes?: number;
  cook_minutes?: number;
  ingredients?: (string | RecipeIngredient)[];
  instructions?: string[];
}

interface Props {
  recipe: RecipeData;
  onCookMeal: (name: string, ingredients: Array<{ item: string; amount: string }>) => void;
  isCooking: boolean;
  onClose: () => void;
  showToast?: ShowToast;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Generate a beep using Web Audio API (no external audio files needed)
function playBeep() {
  try {
    const ctx = new AudioContext();
    const beep = (startTime: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.start(startTime);
      osc.stop(startTime + 0.2);
    };
    // 3 beeps
    beep(ctx.currentTime);
    beep(ctx.currentTime + 0.4);
    beep(ctx.currentTime + 0.8);
  } catch { /* audio not available */ }
}

const CookingMode: React.FC<Props> = ({ recipe, onCookMeal, isCooking, onClose, showToast }) => {
  const steps = recipe.instructions || [];
  const [currentStep, setCurrentStep] = useState(0);

  // Timer state
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);

  // Auto-read aloud toggle (off by default)
  const [autoRead, setAutoRead] = useState(false);

  // Voice feedback
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wake lock
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Normalize ingredients to {amount, item} for command parsing
  const normalizedIngredients = (recipe.ingredients || []).map((ing) => {
    if (typeof ing === 'string') return { amount: '', item: ing };
    return { amount: ing.amount, item: ing.item };
  });

  // Web Speech
  const { isListening, transcript, startListening, stopListening, isSupported } = useWebSpeechRecognition();

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), 3000);
  }, []);

  const speakText = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // Handle commands from voice
  const handleCommand = useCallback((cmd: CookingCommand) => {
    switch (cmd.type) {
      case 'next_step':
        if (currentStep < steps.length - 1) {
          setCurrentStep(prev => prev + 1);
          showFeedback('Next step');
          if (autoRead) speakText(steps[currentStep + 1]);
        } else {
          showFeedback('Already on the last step');
        }
        break;

      case 'prev_step':
        if (currentStep > 0) {
          setCurrentStep(prev => prev - 1);
          showFeedback('Previous step');
          if (autoRead) speakText(steps[currentStep - 1]);
        } else {
          showFeedback('Already on the first step');
        }
        break;

      case 'go_to_step':
        {
          const idx = cmd.step - 1;
          if (idx >= 0 && idx < steps.length) {
            setCurrentStep(idx);
            showFeedback(`Step ${cmd.step}`);
            if (autoRead) speakText(steps[idx]);
          } else {
            showFeedback(`There's no step ${cmd.step}`);
          }
        }
        break;

      case 'read_step':
        speakText(steps[currentStep]);
        showFeedback('Reading step...');
        break;

      case 'set_timer':
        setTimerSeconds(cmd.seconds);
        setTimerRunning(true);
        setTimerDone(false);
        showFeedback(`Timer set: ${formatTimer(cmd.seconds)}`);
        break;

      case 'pause_timer':
        setTimerRunning(false);
        showFeedback('Timer paused');
        break;

      case 'reset_timer':
        setTimerRunning(false);
        setTimerSeconds(0);
        setTimerDone(false);
        showFeedback('Timer reset');
        break;

      case 'ingredient_query':
        if (cmd.answer) {
          showFeedback(cmd.answer);
          speakText(cmd.answer);
        } else {
          const msg = `Couldn't find ${cmd.ingredient} in this recipe`;
          showFeedback(msg);
          speakText(msg);
        }
        break;

      case 'done_cooking':
        handleDone();
        break;

      case 'unknown':
        // Don't show feedback for unrecognized — avoids noise
        break;
    }
  }, [currentStep, steps, showFeedback, speakText]);

  useCookingCommands(transcript, normalizedIngredients, handleCommand);

  // Timer countdown
  useEffect(() => {
    if (!timerRunning || timerSeconds <= 0) return;
    const id = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          setTimerRunning(false);
          setTimerDone(true);
          playBeep();
          speakText('Timer is done!');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning, timerSeconds, speakText]);

  // Request wake lock to keep screen on
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch { /* not available */ }
    };
    requestWakeLock();
    return () => {
      wakeLockRef.current?.release();
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLButtonElement) return;
      if (e.key === 'ArrowRight' || e.key === 'n') {
        if (currentStep < steps.length - 1) {
          setCurrentStep(prev => prev + 1);
          if (autoRead) speakText(steps[currentStep + 1]);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'p') {
        if (currentStep > 0) {
          setCurrentStep(prev => prev - 1);
          if (autoRead) speakText(steps[currentStep - 1]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentStep, steps, onClose, speakText]);

  // Auto-start listening on mount
  useEffect(() => {
    if (isSupported) startListening();
    return () => stopListening();
  }, []);

  const handleDone = () => {
    if (isCooking) return;
    const ingredients = normalizedIngredients.map(ing => ({
      item: ing.item,
      amount: ing.amount,
    }));
    onCookMeal(recipe.name, ingredients);
  };

  return (
    <div className="cooking-mode">
      {/* Feedback toast */}
      {feedback && <div className="cooking-feedback">{feedback}</div>}

      {/* Header */}
      <div className="cooking-header">
        <span className="cooking-step-counter">
          Step {currentStep + 1} of {steps.length}
        </span>
        <h2 className="cooking-title">{recipe.name}</h2>
        <button className="cooking-exit-btn" onClick={onClose} title="Exit cooking mode">
          <X size={18} />
        </button>
      </div>

      <div className="cooking-body">
        {/* Step display */}
        <div className="cooking-step-area">
          <span className="cooking-step-label">Step {currentStep + 1}</span>
          <p className="cooking-step-text">
            {steps[currentStep] || 'No instructions available.'}
          </p>
        </div>

        {/* Step navigation */}
        <div className="cooking-step-nav">
          <button
            className="cooking-nav-btn"
            onClick={() => {
              if (currentStep > 0) {
                setCurrentStep(prev => prev - 1);
                if (autoRead) speakText(steps[currentStep - 1]);
              }
            }}
            disabled={currentStep <= 0}
          >
            <ChevronLeft size={22} />
          </button>

          <div className="cooking-step-dots">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`cooking-dot${i === currentStep ? ' active' : ''}${i < currentStep ? ' completed' : ''}`}
              />
            ))}
          </div>

          <button
            className="cooking-nav-btn"
            onClick={() => {
              if (currentStep < steps.length - 1) {
                setCurrentStep(prev => prev + 1);
                if (autoRead) speakText(steps[currentStep + 1]);
              }
            }}
            disabled={currentStep >= steps.length - 1}
          >
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Read aloud toggle */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            className={`cooking-timer-btn${autoRead ? ' primary' : ''}`}
            onClick={() => {
              const next = !autoRead;
              setAutoRead(next);
              if (next) speakText(steps[currentStep]);
            }}
          >
            {autoRead ? <Volume2 size={14} /> : <VolumeX size={14} />}
            Read aloud {autoRead ? 'on' : 'off'}
          </button>
        </div>

        {/* Timer */}
        <div className="cooking-timer">
          <div className={`cooking-timer-display${timerDone ? ' alert' : ''}`}>
            {formatTimer(timerSeconds)}
          </div>
          <div className="cooking-timer-controls">
            {timerRunning ? (
              <button className="cooking-timer-btn primary" onClick={() => setTimerRunning(false)}>
                <Pause size={14} /> Pause
              </button>
            ) : timerSeconds > 0 ? (
              <button className="cooking-timer-btn primary" onClick={() => { setTimerRunning(true); setTimerDone(false); }}>
                <Play size={14} /> Resume
              </button>
            ) : null}
            <button className="cooking-timer-btn" onClick={() => { setTimerRunning(false); setTimerSeconds(0); setTimerDone(false); }}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
          <div className="cooking-timer-presets">
            {[1, 3, 5, 10, 15].map(min => (
              <button
                key={min}
                className="cooking-preset-btn"
                onClick={() => { setTimerSeconds(min * 60); setTimerRunning(true); setTimerDone(false); showFeedback(`Timer: ${min}m`); }}
              >
                {min}m
              </button>
            ))}
          </div>
        </div>

        {/* Voice status */}
        {isSupported ? (
          <div className="cooking-voice">
            <span className={`cooking-voice-dot${isListening ? ' listening' : ''}`} />
            <span className="cooking-voice-text">
              {isListening ? 'Listening for commands...' : 'Voice paused'}
            </span>
            <button
              className="cooking-voice-btn"
              onClick={isListening ? stopListening : startListening}
            >
              {isListening ? <MicOff size={12} /> : <Mic size={12} />}
              {isListening ? 'Pause' : 'Resume'}
            </button>
          </div>
        ) : (
          <div className="cooking-voice-unsupported">
            <MicOff size={14} />
            Voice commands not supported in this browser. Use Chrome or Edge for hands-free mode.
          </div>
        )}

        {/* Done */}
        <div className="cooking-done-area">
          <button
            className="cooking-done-btn"
            onClick={handleDone}
            disabled={isCooking}
          >
            {isCooking ? <Loader size={16} className="recipe-spinner" /> : <ChefHat size={16} />}
            {isCooking ? 'Logging...' : "I'm done cooking!"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookingMode;
