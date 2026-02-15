import { useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import "./TutorialOverlay.css";

const TUTORIAL_STEPS = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to Voxal!",
    description:
      "Your voice-powered finance and kitchen assistant. Let's take a quick tour of the key features.",
  },
  {
    id: "record",
    target: '[data-tutorial="record-button"]',
    title: "Voice Recording",
    description:
      "Tap the mic to record your voice. Say things like \"I spent $12 on lunch\" or \"What can I cook tonight?\" and Voxy will handle the rest.",
  },
  {
    id: "manual",
    target: '[data-tutorial="manual-button"]',
    title: "Manual Entry",
    description:
      "Prefer typing? Use the manual entry button to type your expenses or questions instead of speaking.",
  },
  {
    id: "receipt",
    target: '[data-tutorial="receipt-button"]',
    title: "Receipt Scanner",
    description:
      "Snap a photo of your receipt and Voxal will automatically extract the expense details for you.",
  },
  {
    id: "daily-recs",
    target: '[data-tutorial="daily-recs-toggle"]',
    title: "Recommendations",
    description:
      "Open this panel to see personalized meal ideas based on what's in your pantry, plus alerts for expiring items.",
  },
  {
    id: "finance",
    target: '[data-tutorial="finance-tab"]',
    title: "Finance Hub",
    description:
      "Your complete money management center. View spending charts on the Dashboard, browse and edit individual transactions in Expenses, set monthly category limits in Budgets, and get AI-powered Spending Insights that spot trends and saving opportunities.",
  },
  {
    id: "kitchen",
    target: '[data-tutorial="kitchen-tab"]',
    title: "Kitchen Hub",
    description:
      "Everything you need to manage your food. The Pantry tracks what you have at home with quantities and expiration dates. The Shopping List auto-removes items when you log a grocery purchase, so it always stays up to date.",
  },
  {
    id: "nav",
    target: '[data-tutorial="nav-tabs"]',
    title: "Navigation",
    description:
      "These tabs are your home base. Tap Voxy to come back here anytime, or explore the Finance and Kitchen sections. You're all set!",
  },
];

const TutorialOverlay = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState(null);

  const step = TUTORIAL_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TUTORIAL_STEPS.length - 1;

  const updateSpotlight = useCallback(() => {
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
    const handleKeyDown = (e) => {
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

  const goNext = () => {
    if (isLast) {
      onClose();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const goPrev = () => {
    if (!isFirst) setCurrentStep((s) => s - 1);
  };

  // Compute card position relative to spotlight
  const getCardStyle = () => {
    if (!spotlightRect) return {};

    const cardWidth = 340;
    const cardMargin = 16;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    const spotCenterX = spotlightRect.left + spotlightRect.width / 2;
    const spotBottom = spotlightRect.top + spotlightRect.height;

    let top, left;

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
