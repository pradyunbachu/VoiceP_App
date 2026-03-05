/*
 * TutorialOverlay.jsx
 * Step-through onboarding overlay for first-time users. Highlights UI
 * elements with a spotlight cutout (positioned dynamically via
 * getBoundingClientRect) while displaying an explanatory card. Supports
 * keyboard navigation (arrow keys, Escape), dot indicators for direct
 * step access, and repositions on window resize/scroll.
 */
import { useState, useEffect, useCallback } from "react";
import type { FC, CSSProperties } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import "./TutorialOverlay.css";

interface TutorialStep {
  id: string;
  target: string | null;
  title: string;
  description: string;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Voxal!",
    description:
      "Your voice-powered finance and kitchen assistant. We've stocked your pantry with sample items so you can explore right away — let's take a quick tour.",
  },
  {
    id: "voxy-fab",
    target: '[data-tutorial="voxy-fab"]',
    title: "Meet Voxy",
    description:
      "Tap the mic button to record your voice, type a message, or scan a receipt. This is available on every page. Pro tip: hold spacebar to quick-record!",
  },
  {
    id: "quick-actions",
    target: '[data-tutorial="quick-actions"]',
    title: "Quick Actions",
    description:
      "Log an expense, scan a receipt, add to your shopping list, or find a recipe — all in one tap.",
  },
  {
    id: "expenses-card",
    target: '[data-tutorial="expenses-card"]',
    title: "Weekly Spending",
    description:
      "See your spending at a glance with a daily breakdown. Tap the card to dive into the full Expenses view where you can browse, edit, and filter every transaction.",
  },
  {
    id: "pantry-card",
    target: '[data-tutorial="pantry-card"]',
    title: "Pantry Alerts",
    description:
      "Stay on top of low stock and expiring items. We've added some sample items that are expiring soon so you can see this in action — tap the card to manage your pantry!",
  },
  {
    id: "budget-card",
    target: '[data-tutorial="budget-card"]',
    title: "Budget Tracker",
    description:
      "Set monthly spending limits by category and track your progress. The bar fills up as you spend — red means you're over budget.",
  },
  {
    id: "shopping-card",
    target: '[data-tutorial="shopping-card"]',
    title: "Shopping List",
    description:
      "Your shopping list auto-removes items when you log a grocery purchase, so it always stays up to date. Ask Voxy to add items by voice!",
  },
  {
    id: "finance",
    target: '[data-tutorial="finance-tab"]',
    title: "Finance Hub",
    description:
      "Your complete money management center. View spending charts, browse transactions, set budget limits, and get AI-powered insights that spot trends and saving opportunities.",
  },
  {
    id: "kitchen",
    target: '[data-tutorial="kitchen-tab"]',
    title: "Kitchen Hub",
    description:
      "Manage your food here. Your pantry is pre-stocked with sample items — try the Chef to generate recipes from what's already there!",
  },
  {
    id: "nav",
    target: '[data-tutorial="nav-tabs"]',
    title: "Navigation",
    description:
      "Use these tabs to move between sections. Tap Home to come back to this dashboard anytime. You're all set!",
  },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const TutorialOverlay: FC<Props> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);

  const step = TUTORIAL_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TUTORIAL_STEPS.length - 1;

  const updateSpotlight = useCallback((): void => {
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

  useEffect(() => {
    if (!isOpen) return;
    updateSpotlight();
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);
    return () => {
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, true);
    };
  }, [isOpen, updateSpotlight]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        if (!isLast) setCurrentStep((s) => s + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!isFirst) setCurrentStep((s) => s - 1);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isFirst, isLast, onClose]);

  // Reset step when opened
  useEffect(() => {
    if (isOpen) setCurrentStep(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const goNext = (): void => {
    if (isLast) {
      onClose();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const goPrev = (): void => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  };

  // Compute card position relative to spotlight
  const getCardStyle = (): CSSProperties => {
    if (!spotlightRect) return {};

    const cardWidth = 340;
    const cardMargin = 16;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const spotCenterX = spotlightRect.left + spotlightRect.width / 2;
    const spotBottom = spotlightRect.top + spotlightRect.height;

    let top: number, left: number;

    // Try placing below the spotlight
    if (spotBottom + cardMargin + 200 < viewportH) {
      top = spotBottom + cardMargin;
    } else {
      // Place above
      top = spotlightRect.top - cardMargin - 200;
      if (top < cardMargin) top = cardMargin;
    }

    left = spotCenterX - cardWidth / 2;
    // Clamp to viewport
    if (left < cardMargin) left = cardMargin;
    if (left + cardWidth > viewportW - cardMargin)
      left = viewportW - cardMargin - cardWidth;

    return { position: "fixed", top: `${top}px`, left: `${left}px`, width: `${cardWidth}px` };
  };

  return (
    <div className="tutorial-overlay">
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

      {/* Card */}
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

        <h3 className="tutorial-title">{step.title}</h3>
        <p className="tutorial-description">{step.description}</p>

        <div className="tutorial-footer">
          <div className="tutorial-dots">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                className={`tutorial-dot ${i === currentStep ? "active" : ""}`}
                onClick={() => setCurrentStep(i)}
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
            <button className="tutorial-btn tutorial-btn-primary" onClick={goNext}>
              {isLast ? "Get Started" : "Next"}
              {!isLast && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialOverlay;
