/*
 * TutorialOverlay.tsx
 * Interactive first-run onboarding. Uses spotlight cutouts to highlight UI
 * elements and walks the user through the app: the home dashboard first
 * (voice bar, Tonight's Pick, stats, Demo Pantry), then a hands-on expense,
 * then the feature tabs (Pantry, Shopping, Chef, Planner).
 */
import { useState, useEffect, useCallback } from "react";
import type { FC, CSSProperties } from "react";
import { X, ChevronLeft, ChevronRight, Package, DollarSign, UtensilsCrossed, ChefHat, Flame, Mic, ShoppingCart, CalendarDays, FlaskConical, Sparkles } from "lucide-react";
import "./TutorialOverlay.css";

interface TutorialStep {
  id: string;
  /** CSS selector(s) for the spotlight target. If an array, the first visible match is used. */
  target: string | string[] | null;
  title: string;
  description: string;
  /** If set, the "Next" button reads this label instead. */
  action?: string;
  /** If true, the step waits for the user to interact with the highlighted element. */
  waitForInteraction?: boolean;
  icon?: React.ReactNode;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Find the first DOM element from one or more selectors that is actually visible (non-zero size). */
const findVisibleTarget = (target: string | string[] | null): Element | null => {
  if (!target) return null;
  const selectors = Array.isArray(target) ? target : [target];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el;
  }
  return null;
};

const TUTORIAL_STEPS: TutorialStep[] = [
  // Welcome
  {
    id: "welcome",
    target: null,
    title: "Welcome to Voxal!",
    description:
      "Your voice-powered kitchen & finance assistant. Just talk — Voxal logs expenses, stocks your pantry, and suggests meals. Here’s a quick 60-second tour.",
    icon: <Sparkles size={20} />,
  },
  // Home dashboard first
  {
    id: "speak",
    target: '[data-tutorial="voxy-fab"]',
    title: "Just Speak",
    description:
      "This is how you do almost everything in Voxal. Tap the mic and talk, hold the spacebar to quick-record from any page, or tap the keyboard to type it out.",
    icon: <Mic size={20} />,
  },
  {
    id: "hero-meal",
    target: '[data-tutorial="hero-meal"]',
    title: "Tonight’s Pick",
    description:
      "Your home screen suggests a meal based on what’s in your pantry, prioritizing ingredients about to expire so nothing goes to waste. Tap it any time for the full recipe.",
    icon: <UtensilsCrossed size={20} />,
  },
  {
    id: "cooking-stats",
    target: '[data-tutorial="cooking-stats"]',
    title: "Your Stats at a Glance",
    description:
      "Right below, keep an eye on your cooking streak, pantry stock, shopping list, and budget — all from home. Tap any card to jump straight in.",
    icon: <Flame size={20} />,
  },
  {
    id: "demo-pantry",
    target: '[data-tutorial="pantry-switcher"]',
    title: "Play in the Demo Pantry",
    description:
      "New here? Use this switcher to hop into the Demo Pantry — a safe sandbox pre-loaded with sample items. Experiment freely; nothing touches your real data, and you can reset it anytime. Switch to My Pantry when you’re ready.",
    icon: <FlaskConical size={20} />,
  },
  // Hands-on expense
  {
    id: "expense",
    target: '[data-tutorial="voxy-fab"]',
    title: "Log an Expense",
    description:
      "Try it now: tap the mic and rattle off a whole trip — like “I got $4 of lettuce, 4 lbs of peanuts, and chicken for $7.” Voxal splits out each item with its amount and category, then offers to add them straight to your pantry.",
    action: "Try it now",
    icon: <DollarSign size={20} />,
    waitForInteraction: true,
  },
  // Feature walk-through
  {
    id: "pantry",
    target: ['[data-tutorial="pantry-tab"]', '[data-tutorial="mobile-nav"]'],
    title: "Your Pantry",
    description:
      "The Pantry tracks everything in your kitchen — quantities, stock levels, and expiration dates. Add items by voice (“I have eggs and milk”) or drag them between shelves.",
    icon: <Package size={20} />,
  },
  {
    id: "shopping",
    target: ['[data-tutorial="shopping-tab"]', '[data-tutorial="mobile-nav"]'],
    title: "Shopping List",
    description:
      "Keep track of what you need to buy. Add items by voice, check them off as you shop, and tap to move bought items straight into your pantry.",
    icon: <ShoppingCart size={20} />,
  },
  {
    id: "chef",
    target: ['[data-tutorial="chef-tab"]', '[data-tutorial="mobile-nav"]'],
    title: "Chef",
    description:
      "Turn what you have into dinner. Drag ingredients into the bowl to generate recipes, or just ask Voxal “what can I make?”",
    icon: <ChefHat size={20} />,
  },
  {
    id: "planner",
    target: ['[data-tutorial="planner-tab"]', '[data-tutorial="mobile-nav"]'],
    title: "Meal Planner",
    description:
      "Plan your meals for the week and let Voxal auto-build a shopping list from your plan. Saved Recipes keeps your favorites one tap away.",
    icon: <CalendarDays size={20} />,
  },
  // Finish
  {
    id: "finish",
    target: null,
    title: "You’re All Set!",
    description:
      "Remember — just talk. The voice bar works on every page, and holding the spacebar quick-records anywhere. Start in the Demo Pantry to play around, then switch to My Pantry when you’re ready. Enjoy Voxal!",
    action: "Get Started",
    icon: <Sparkles size={20} />,
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const TutorialOverlay: FC<Props> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [waitingForUser, setWaitingForUser] = useState<boolean>(false);

  const step = TUTORIAL_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TUTORIAL_STEPS.length - 1;

  const measureSpotlight = useCallback((): void => {
    const el = findVisibleTarget(step.target);
    if (!el) {
      setSpotlightRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const padding = 8;
    setSpotlightRect({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });
  }, [step.target]);

  // Scroll the target element into view, then measure its position
  const scrollAndSpotlight = useCallback((): void => {
    const el = findVisibleTarget(step.target);
    if (!el) {
      setSpotlightRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const inView =
      rect.top >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.left >= 0 &&
      rect.right <= window.innerWidth;

    if (inView) {
      measureSpotlight();
    } else {
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      setTimeout(measureSpotlight, 300);
    }
  }, [step.target, measureSpotlight]);

  useEffect(() => {
    if (!isOpen) return;
    scrollAndSpotlight();
    setWaitingForUser(false);
    window.addEventListener("resize", measureSpotlight);
    window.addEventListener("scroll", measureSpotlight, true);
    return () => {
      window.removeEventListener("resize", measureSpotlight);
      window.removeEventListener("scroll", measureSpotlight, true);
    };
  }, [isOpen, scrollAndSpotlight, measureSpotlight]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        if (!isLast && !waitingForUser) setCurrentStep((s) => s + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!isFirst) setCurrentStep((s) => s - 1);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isFirst, isLast, onClose, waitingForUser]);

  // Reset step when opened
  useEffect(() => {
    if (isOpen) setCurrentStep(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const goNext = (): void => {
    if (step.waitForInteraction && !waitingForUser) {
      // First click: let user interact with the highlighted element
      setWaitingForUser(true);
      return;
    }
    if (isLast) {
      onClose();
    } else {
      setWaitingForUser(false);
      setCurrentStep((s) => s + 1);
    }
  };

  const goPrev = (): void => {
    if (!isFirst) {
      setWaitingForUser(false);
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSkipAction = (): void => {
    // Skip the "try it" step and move to the next step
    setWaitingForUser(false);
    setCurrentStep((s) => s + 1);
  };

  // Compute card position relative to spotlight
  const getCardStyle = (): CSSProperties => {
    if (!spotlightRect) return {};

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const cardMargin = 16;
    const cardWidth = Math.min(360, viewportW - cardMargin * 2);

    const spotCenterX = spotlightRect.left + spotlightRect.width / 2;
    const spotBottom = spotlightRect.top + spotlightRect.height;

    let top: number, left: number;

    // Estimate card height — give more room on narrow screens (text wraps more)
    const estimatedCardHeight = viewportW <= 420 ? 260 : 220;

    if (spotBottom + cardMargin + estimatedCardHeight < viewportH) {
      // Place below the spotlight
      top = spotBottom + cardMargin;
    } else if (spotlightRect.top - cardMargin - estimatedCardHeight > 0) {
      // Place above the spotlight
      top = spotlightRect.top - cardMargin - estimatedCardHeight;
    } else {
      // Fallback: center vertically
      top = Math.max(cardMargin, (viewportH - estimatedCardHeight) / 2);
    }

    left = spotCenterX - cardWidth / 2;
    if (left < cardMargin) left = cardMargin;
    if (left + cardWidth > viewportW - cardMargin)
      left = viewportW - cardMargin - cardWidth;

    return { position: "fixed", top: `${top}px`, left: `${left}px`, width: `${cardWidth}px` };
  };

  // When the user is interacting (waitingForUser), reduce overlay opacity
  // so they can actually tap the FAB
  const overlayInteractive = waitingForUser;

  return (
    <div className={`tutorial-overlay${overlayInteractive ? ' interactive' : ''}`}>
      {/* Spotlight cutout or full overlay */}
      {spotlightRect ? (
        <div
          className="tutorial-spotlight"
          style={{
            top: `${spotlightRect.top}px`,
            left: `${spotlightRect.left}px`,
            width: `${spotlightRect.width}px`,
            height: `${spotlightRect.height}px`,
          }}
        />
      ) : (
        <div className="tutorial-backdrop" />
      )}

      {/* Card — hidden when user is interacting with the app */}
      {!overlayInteractive && (
        <div
          className={`tutorial-card ${!spotlightRect ? "centered" : ""}`}
          style={spotlightRect ? getCardStyle() : undefined}
        >
          <button className="tutorial-close" onClick={onClose} aria-label="Close tutorial">
            <X size={18} />
          </button>

          <div className="tutorial-step-label">
            {currentStep + 1} / {TUTORIAL_STEPS.length}
          </div>

          {step.icon && <div className="tutorial-icon">{step.icon}</div>}

          <h3 className="tutorial-title">{step.title}</h3>
          <p className="tutorial-description">{step.description}</p>

          <div className="tutorial-footer">
            <div className="tutorial-dots">
              {TUTORIAL_STEPS.map((_, i) => (
                <button
                  key={i}
                  className={`tutorial-dot ${i === currentStep ? "active" : ""} ${i < currentStep ? "completed" : ""}`}
                  onClick={() => { setWaitingForUser(false); setCurrentStep(i); }}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            <div className="tutorial-nav-buttons">
              {!isFirst && (
                <button className="tutorial-btn tutorial-btn-secondary" onClick={goPrev}>
                  <ChevronLeft size={16} />
                  Back
                </button>
              )}
              {step.waitForInteraction && (
                <button className="tutorial-btn tutorial-btn-secondary" onClick={handleSkipAction}>
                  Skip
                </button>
              )}
              <button className="tutorial-btn tutorial-btn-primary" onClick={goNext}>
                {step.action || (isLast ? "Get Started" : "Next")}
                {!isLast && !step.action && <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating hint when user is interacting */}
      {overlayInteractive && (
        <div className="tutorial-interaction-hint">
          <span>Go ahead — try logging that expense, then tap Done.</span>
          <button className="tutorial-btn tutorial-btn-primary" onClick={goNext}>
            Done
          </button>
          <button className="tutorial-btn tutorial-btn-secondary" onClick={handleSkipAction}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
};

export default TutorialOverlay;
