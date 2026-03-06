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
      "Your voice-powered kitchen assistant. We've stocked your pantry with sample items so you can explore right away — let's take a quick tour.",
  },
  {
    id: "quick-actions",
    target: '[data-tutorial="quick-actions"]',
    title: "Quick Actions",
    description:
      "Jump to your pantry, add to your shopping list, find a recipe, or use voice input — all in one tap.",
  },
  {
    id: "pantry-card",
    target: '[data-tutorial="pantry-card"]',
    title: "Pantry Alerts",
    description:
      "Stay on top of low stock and expiring items. We've added some sample items that are expiring soon so you can see this in action — tap to manage your pantry!",
  },
  {
    id: "shopping-card",
    target: '[data-tutorial="shopping-card"]',
    title: "Shopping List",
    description:
      "Keep track of what you need. When you buy something, tap the pantry icon to move it straight into your pantry. Low stock items can be added from the pantry page too!",
  },
  {
    id: "expenses-card",
    target: '[data-tutorial="expenses-card"]',
    title: "Spending Overview",
    description:
      "See your weekly grocery spending at a glance. Tap the card for a full breakdown with filters and charts.",
  },
  {
    id: "budget-card",
    target: '[data-tutorial="budget-card"]',
    title: "Budget Tracker",
    description:
      "Set monthly spending limits by category and track your progress. The bar fills up as you spend — red means you're over budget.",
  },
  {
    id: "kitchen",
    target: '[data-tutorial="kitchen-tab"]',
    title: "Pantry",
    description:
      "Your pantry is pre-stocked with sample items. Manage your inventory, and use the action banners to add low stock items to your shopping list or cook with expiring ones!",
  },
  {
    id: "nav",
    target: '[data-tutorial="nav-tabs"]',
    title: "Navigation",
    description:
      "Pantry, Shopping, and Chef are right here in the top bar. Finance lives in the dropdown for when you need it. Tap Home to come back to the dashboard anytime.",
  },
  {
    id: "voxy-fab",
    target: '[data-tutorial="voxy-fab"]',
    title: "Meet Voxy",
    description:
      "Tap the mic button to record your voice, type a message, or scan a receipt. Available on every page. Pro tip: hold spacebar to quick-record! You're all set!",
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
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    // Measure after scroll animation settles
    setTimeout(measureSpotlight, 350);
  }, [step.target, measureSpotlight]);

  useEffect(() => {
    if (!isOpen) return;
    scrollAndSpotlight();
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
