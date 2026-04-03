/*
 * TutorialOverlay.tsx
 * Interactive onboarding that guides users through their first expense
 * and first pantry add. Uses spotlight cutouts to highlight UI elements
 * and walks through actionable steps rather than a passive tour.
 *
 * Phase 1: Welcome (1 step)
 * Phase 2: Guided first expense via voice/type (2 steps)
 * Phase 3: Guided first pantry add (2 steps)
 * Phase 4: Dashboard & feature overview (4 steps)
 */
import { useState, useEffect, useCallback } from "react";
import type { FC, CSSProperties } from "react";
import { X, ChevronLeft, ChevronRight, Package, DollarSign, UtensilsCrossed, ChefHat, Flame, LayoutDashboard } from "lucide-react";
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
  // ── Phase 1: Welcome ──────────────────────────────────────────────
  {
    id: "welcome",
    target: null,
    title: "Welcome to Voxal!",
    description:
      "Your voice-powered kitchen & finance assistant. Just talk \u2014 Voxal tracks expenses, manages your pantry, and suggests meals. Let\u2019s get you started in under a minute.",
    icon: <UtensilsCrossed size={20} />,
  },
  // ── Phase 2: First Expense ─────────────────────────────────────────
  {
    id: "expense-intro",
    target: '[data-tutorial="voxy-fab"]',
    title: "Log Your First Expense",
    description:
      'Tap the mic and say something like "I spent $12 at Trader Joe\u2019s on groceries" \u2014 or tap Type if you prefer. Voxal extracts the store, amount, and category automatically.',
    action: "Try it now",
    icon: <DollarSign size={20} />,
    waitForInteraction: true,
  },
  {
    id: "expense-done",
    target: null,
    title: "Nice! Expense Logged",
    description:
      "One sentence and it\u2019s tracked. You can also scan receipts with your camera. Everything flows into your budgets and spending insights automatically.",
  },
  // ── Phase 3: First Pantry Add ──────────────────────────────────────
  {
    id: "pantry-intro",
    target: '[data-tutorial="voxy-fab"]',
    title: "Stock Your Pantry",
    description:
      'Now tell Voxal what\u2019s in your kitchen. Tap the mic and say "I have eggs, milk, and butter" \u2014 or type it out. Each item gets added to your pantry inventory.',
    action: "Try it now",
    icon: <Package size={20} />,
    waitForInteraction: true,
  },
  {
    id: "pantry-done",
    target: null,
    title: "Pantry Stocked!",
    description:
      "Voxal now tracks what\u2019s in your kitchen \u2014 expiration dates, stock levels, and all. It\u2019ll suggest meals based on what you have and nudge you before things expire.",
  },
  // ── Phase 4: Feature overview ──────────────────────────────────────
  {
    id: "hero-meal",
    target: '[data-tutorial="hero-meal"]',
    title: "Tonight\u2019s Pick",
    description:
      "Your dashboard shows a personalized meal suggestion based on what\u2019s in your pantry. It prioritizes ingredients that are expiring soon to help reduce waste. Tap it to see the full recipe.",
    icon: <ChefHat size={20} />,
  },
  {
    id: "cooking-stats",
    target: '[data-tutorial="cooking-stats"]',
    title: "Your Stats at a Glance",
    description:
      "Track your cooking streak, pantry stock levels, shopping list, and budget \u2014 all from the home screen. Tap any card to dive deeper.",
    icon: <Flame size={20} />,
  },
  {
    id: "nav-overview",
    target: ['[data-tutorial="nav-tabs"]', '[data-tutorial="mobile-nav"]'],
    title: "Explore the App",
    description:
      "Pantry manages your inventory. Shopping List tracks what to buy. Chef lets you drag ingredients into a bowl to generate recipes. Planner organizes your week. Saved Recipes keeps your favorites.",
    icon: <LayoutDashboard size={20} />,
  },
  {
    id: "finish",
    target: null,
    title: "You\u2019re All Set!",
    description:
      "You\u2019ve logged an expense, stocked your pantry, and explored the dashboard. The voice bar works from every page \u2014 and you can hold spacebar to quick-record anytime. Voxal gets smarter the more you use it. Enjoy!",
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
    // Skip the "try it" step and move to the "done" step
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
