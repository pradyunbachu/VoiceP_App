/*
 * TutorialOverlay.tsx
 * Interactive onboarding that guides users through their first expense
 * and first pantry add. Uses spotlight cutouts to highlight UI elements
 * and walks through actionable steps rather than a passive tour.
 *
 * Phase 1: Welcome + overview (2 steps)
 * Phase 2: Guided first expense via voice/type (3 steps)
 * Phase 3: Guided first pantry add (3 steps)
 * Phase 4: Wrap-up with remaining features (2 steps)
 */
import { useState, useEffect, useCallback } from "react";
import type { FC, CSSProperties } from "react";
import { X, ChevronLeft, ChevronRight, Mic, Keyboard, Package, DollarSign, UtensilsCrossed, ChefHat } from "lucide-react";
import "./TutorialOverlay.css";

interface TutorialStep {
  id: string;
  target: string | null;
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

const TUTORIAL_STEPS: TutorialStep[] = [
  // ── Phase 1: Welcome ──────────────────────────────────────────────
  {
    id: "welcome",
    target: null,
    title: "Welcome to Voxal!",
    description:
      "Your voice-powered kitchen & finance assistant. Let's get you set up in 60 seconds — we'll log your first expense and add your first pantry item.",
    icon: <UtensilsCrossed size={20} />,
  },
  // ── Phase 2: First Expense ─────────────────────────────────────────
  {
    id: "expense-intro",
    target: '[data-tutorial="voxy-fab"]',
    title: "Log Your First Expense",
    description:
      'Tap the mic button to say something like "I spent $5 at Starbucks on coffee" — or tap Type if you prefer. Voxal will extract the store, amount, and category automatically.',
    action: "Try it now",
    icon: <DollarSign size={20} />,
    waitForInteraction: true,
  },
  {
    id: "expense-done",
    target: null,
    title: "Nice! Expense Logged",
    description:
      "That's it — one sentence and your expense is tracked. You can also scan a receipt with your camera or type it out. All your spending shows up on the dashboard.",
  },
  // ── Phase 3: First Pantry Add ──────────────────────────────────────
  {
    id: "pantry-intro",
    target: '[data-tutorial="voxy-fab"]',
    title: "Add to Your Pantry",
    description:
      'Now try adding what\'s in your kitchen. Tap the mic and say "I have eggs, milk, and butter" — or type it. Voxal will add each item to your pantry inventory.',
    action: "Try it now",
    icon: <Package size={20} />,
    waitForInteraction: true,
  },
  {
    id: "pantry-done",
    target: null,
    title: "Pantry Stocked!",
    description:
      "Voxal now knows what's in your kitchen. It'll track expiration dates, alert you when items run low, and suggest meals based on what you have.",
  },
  // ── Phase 4: Feature overview ──────────────────────────────────────
  {
    id: "nav-overview",
    target: '[data-tutorial="nav-tabs"]',
    title: "Explore the App",
    description:
      "Pantry manages your inventory. Shopping List tracks what to buy. Chef suggests recipes from your ingredients. Finance has expenses, budgets, and insights.",
  },
  {
    id: "quick-actions",
    target: '[data-tutorial="quick-actions"]',
    title: "Quick Actions",
    description:
      "These shortcuts let you jump to your pantry, shopping list, or recipes in one tap. The voice button works from every page — and you can hold spacebar to quick-record!",
  },
  {
    id: "daily-recs",
    target: '[data-tutorial="daily-recs-toggle"]',
    title: "Voxy's Picks",
    description:
      "Tap here anytime for AI meal suggestions based on what's in your pantry. It prioritizes expiring items to help reduce waste. You can save recipes you love with the heart button.",
    icon: <ChefHat size={20} />,
  },
  {
    id: "finish",
    target: null,
    title: "You're All Set!",
    description:
      "You've logged an expense, stocked your pantry, and explored the key features. Voxal learns your habits over time — the more you use it, the smarter it gets. Enjoy!",
    action: "Get Started",
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
    if (!step.target) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(step.target);
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
    if (!step.target) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(step.target);
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
    // Skip the "try it" step and move to the "done" step
    setWaitingForUser(false);
    setCurrentStep((s) => s + 1);
  };

  // Compute card position relative to spotlight
  const getCardStyle = (): CSSProperties => {
    if (!spotlightRect) return {};

    const cardWidth = 360;
    const cardMargin = 16;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const spotCenterX = spotlightRect.left + spotlightRect.width / 2;
    const spotBottom = spotlightRect.top + spotlightRect.height;

    let top: number, left: number;

    if (spotBottom + cardMargin + 200 < viewportH) {
      top = spotBottom + cardMargin;
    } else {
      top = spotlightRect.top - cardMargin - 200;
      if (top < cardMargin) top = cardMargin;
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
          <span>Go ahead — try it! Then tap here when done.</span>
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
