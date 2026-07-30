/*
 * LandingPage.tsx
 * Public marketing page shown before the user logs in. Composed of a hero
 * section with tagline and CTA, a voice-demo showing how one sentence logs
 * an expense / updates the pantry / checks off a shopping list, a feature
 * card grid (Smart Pantry, Recipes, Shopping Lists, Insights), a step-by-step
 * "Loop" flow diagram, and a bottom call-to-action. Adapts the primary CTA
 * label based on authentication state.
 */
import { useEffect, useState, type FC } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Mic,
  LogIn,
  Package,
  ShoppingCart,
  ArrowRight,
  TrendingDown,
  ChefHat,
  Sparkles,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import "./LandingPage.css";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

/*
 * App screenshots shown inside the phone mockup. To add one, drop the image
 * file in public/screenshots/ and add a matching entry here. The carousel
 * auto-rotates through every entry and shows a styled placeholder for any
 * file that is missing, so it never breaks while you're still adding shots.
 */
const SCREENSHOTS: { src: string; alt: string }[] = [
  {
    src: "/screenshots/01-home.png",
    alt: "voxal home screen showing tonight's recipe pick and kitchen stats",
  },
  {
    src: "/screenshots/02-pantry.png",
    alt: "voxal pantry list with items, categories, and expiration dates",
  },
  {
    src: "/screenshots/03-voice.png",
    alt: "voxal voice input screen with a tap-to-talk microphone",
  },
  {
    src: "/screenshots/04-insights.png",
    alt: "voxal spending insights with totals and category breakdown",
  },
];

const SLIDE_INTERVAL_MS = 3800;

const PhoneShowcase: FC<{ reduceMotion: boolean | null }> = ({ reduceMotion }) => {
  const [index, setIndex] = useState(0);
  const [errored, setErrored] = useState<Record<number, boolean>>({});
  // Hide the placeholder once a real screenshot has painted, so it never
  // bleeds through the semi-transparent layers during a crossfade.
  const [ready, setReady] = useState(false);
  const multiple = SCREENSHOTS.length > 1;

  useEffect(() => {
    if (reduceMotion || !multiple) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % SCREENSHOTS.length),
      SLIDE_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [reduceMotion, multiple]);

  const go = (delta: number) =>
    setIndex((i) => (i + delta + SCREENSHOTS.length) % SCREENSHOTS.length);

  return (
    <div className="phone-showcase">
      <div className="phone-frame">
        <div className="phone-screen">
          {/* Visible only until a real screenshot has loaded on top of it. */}
          {!ready && (
            <div className="phone-placeholder" aria-hidden="true">
              <Mic size={30} />
              <span>Screenshot coming soon</span>
            </div>
          )}
          {SCREENSHOTS.map((shot, i) =>
            errored[i] ? null : (
              <img
                key={shot.src}
                src={shot.src}
                alt={shot.alt}
                className={`phone-slide${i === index ? " active" : ""}`}
                loading="lazy"
                draggable={false}
                onLoad={() => setReady(true)}
                onError={() => setErrored((e) => ({ ...e, [i]: true }))}
              />
            ),
          )}
        </div>
      </div>
      {multiple && (
        <div className="phone-controls">
          <button
            type="button"
            className="phone-nav"
            aria-label="Previous screenshot"
            onClick={() => go(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="phone-dots" role="tablist" aria-label="App screenshots">
            {SCREENSHOTS.map((shot, i) => (
              <button
                key={shot.src}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Show screenshot ${i + 1}`}
                className={`phone-dot${i === index ? " active" : ""}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button
            type="button"
            className="phone-nav"
            aria-label="Next screenshot"
            onClick={() => go(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
};

interface Props {
  onGetStarted: () => void;
  onLogin?: () => void;
  isAuthenticated?: boolean;
}

const LandingPage: FC<Props> = ({ onGetStarted, onLogin, isAuthenticated = false }) => {
  const reduceMotion = useReducedMotion();
  const ctaLabel = isAuthenticated ? "Go to Dashboard" : "Get Started";

  // When reduced motion is requested, render content immediately with no transform.
  const motionProps = reduceMotion
    ? { initial: false as const }
    : { variants: stagger, initial: "hidden" as const };

  return (
    <div className="landing-page">
      {!isAuthenticated && onLogin && (
        <button className="landing-login-button" onClick={onLogin}>
          <LogIn size={18} />
          <span>Login</span>
        </button>
      )}

      {/* Section 1: Hero */}
      <motion.section
        className="landing-hero"
        {...motionProps}
        animate="visible"
      >
        <div className="landing-hero-content">
          <motion.span className="hero-eyebrow" variants={fadeUp}>
            <Sparkles size={14} />
            Voice-first kitchen, reimagined
          </motion.span>
          <motion.h1 className="landing-title" variants={fadeUp}>voxal</motion.h1>
          <motion.p className="landing-tagline" variants={fadeUp}>
            Your kitchen, organized by voice.
          </motion.p>
          <motion.p className="landing-description" variants={fadeUp}>
            Track what's in your pantry, get recipes before food expires,
            and keep your shopping list in sync, all with one sentence.
          </motion.p>
          <motion.div className="hero-cta-row" variants={fadeUp}>
            <button className="get-started-button" onClick={onGetStarted}>
              {ctaLabel}
              <ArrowRight size={18} />
            </button>
          </motion.div>
          <motion.div className="highlight-pills" variants={fadeUp}>
            <div className="highlight-pill">
              <Package size={16} />
              <span>Smart Pantry</span>
            </div>
            <div className="highlight-pill">
              <ChefHat size={16} />
              <span>Meal Recipes</span>
            </div>
            <div className="highlight-pill">
              <ShoppingCart size={16} />
              <span>Shopping Lists</span>
            </div>
            <div className="highlight-pill">
              <Mic size={16} />
              <span>Voice-First</span>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Section 1.5: App showcase (phone mockup carousel) */}
      <motion.section
        className="landing-section landing-showcase"
        initial={reduceMotion ? false : "hidden"}
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
      >
        <div className="showcase-layout">
          <div className="showcase-copy">
            <motion.span className="section-eyebrow showcase-eyebrow" variants={fadeUp}>
              See it in action
            </motion.span>
            <motion.span className="dev-badge" variants={fadeUp}>
              <span className="dev-badge-dot" />
              iOS app in development
            </motion.span>
            <motion.h2 className="landing-section-title showcase-title" variants={fadeUp}>
              Your whole kitchen, at a glance
            </motion.h2>
            <motion.p className="showcase-text" variants={fadeUp}>
              A home screen that opens to what to cook tonight, what's stocked,
              and what's running low. It updates the moment you speak.
            </motion.p>
            <motion.ul className="showcase-points" variants={fadeUp}>
              <li>
                <Check size={16} />
                <span>Tonight's pick, chosen from what you already have</span>
              </li>
              <li>
                <Check size={16} />
                <span>Live counts for pantry, shopping list, and streaks</span>
              </li>
              <li>
                <Check size={16} />
                <span>Speak, type, or snap to log in one tap</span>
              </li>
            </motion.ul>
          </div>
          <motion.div className="showcase-phone-wrap" variants={fadeUp}>
            <PhoneShowcase reduceMotion={reduceMotion} />
            <span className="showcase-caption">
              Work-in-progress preview of the iOS app. Designs are still evolving.
            </span>
          </motion.div>
        </div>
      </motion.section>

      {/* Section 2: One sentence does it all */}
      <motion.section
        className="landing-section landing-voice-demo"
        initial={reduceMotion ? false : "hidden"}
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={stagger}
      >
        <motion.span className="section-eyebrow" variants={fadeUp}>How it works</motion.span>
        <motion.h2 className="landing-section-title" variants={fadeUp}>One sentence does it all</motion.h2>
        <motion.div className="voice-demo-panel" variants={fadeUp}>
          <div className="voice-bubble">
            <span className="voice-bubble-avatar">
              <Mic size={18} />
            </span>
            <span className="voice-bubble-text">
              "I bought chicken, rice, and broccoli at Costco for $22"
            </span>
          </div>
          <div className="connector-line" />
          <div className="result-cards">
            <div className="result-card">
              <div className="result-card-icon purple">
                <Package size={18} />
              </div>
              <div className="result-card-text">
                <strong>Pantry Updated</strong>
                <span>3 items added with expiration tracking</span>
              </div>
            </div>
            <div className="result-card">
              <div className="result-card-icon amber">
                <ShoppingCart size={18} />
              </div>
              <div className="result-card-text">
                <strong>List Updated</strong>
                <span>Items auto-checked off your shopping list</span>
              </div>
            </div>
            <div className="result-card">
              <div className="result-card-icon blue">
                <TrendingDown size={18} />
              </div>
              <div className="result-card-text">
                <strong>Expense Logged</strong>
                <span>$22 at Costco, filed under Groceries</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.section>

      {/* Section 3: Feature cards */}
      <motion.section
        className="landing-section landing-features"
        initial={reduceMotion ? false : "hidden"}
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
      >
        <motion.span className="section-eyebrow" variants={fadeUp}>Everything in one place</motion.span>
        <motion.h2 className="landing-section-title" variants={fadeUp}>Built for the way you cook</motion.h2>
        <div className="feature-grid">
          <motion.div className="feature-card" variants={fadeUp}>
            <div className="feature-icon blue">
              <Package size={22} />
            </div>
            <h3>Smart Pantry</h3>
            <p>
              Know exactly what you have. See expiration dates at a glance. No
              more buying duplicates or throwing out food.
            </p>
          </motion.div>
          <motion.div className="feature-card" variants={fadeUp}>
            <div className="feature-icon purple">
              <ChefHat size={22} />
            </div>
            <h3>Recipe Suggestions</h3>
            <p>
              Ask what you can cook tonight. Get answers based on what's actually
              in your pantry.
            </p>
          </motion.div>
          <motion.div className="feature-card" variants={fadeUp}>
            <div className="feature-icon amber">
              <ShoppingCart size={22} />
            </div>
            <h3>Shared Shopping Lists</h3>
            <p>
              Auto-generated from meal plans. Share with your partner or
              roommates.
            </p>
          </motion.div>
          <motion.div className="feature-card" variants={fadeUp}>
            <div className="feature-icon red">
              <TrendingDown size={22} />
            </div>
            <h3>Grocery Spending</h3>
            <p>
              Automatically track what you spend on groceries. See trends by
              store and category.
            </p>
          </motion.div>
        </div>
      </motion.section>

      {/* Section 4: The Loop */}
      <motion.section
        className="landing-section landing-loop"
        initial={reduceMotion ? false : "hidden"}
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={stagger}
      >
        <motion.span className="section-eyebrow" variants={fadeUp}>The rhythm</motion.span>
        <motion.h2 className="landing-section-title" variants={fadeUp}>The Loop</motion.h2>
        <motion.div className="loop-steps" variants={fadeUp}>
          <div className="loop-step">
            <div className="loop-step-icon">
              <Package size={22} />
              <span className="loop-step-num">1</span>
            </div>
            <strong>Stock up</strong>
            <span>Add groceries to your pantry</span>
          </div>
          <ArrowRight size={18} className="loop-arrow" />
          <div className="loop-step">
            <div className="loop-step-icon">
              <ChefHat size={22} />
              <span className="loop-step-num">2</span>
            </div>
            <strong>Cook</strong>
            <span>Get recipes from what you have</span>
          </div>
          <ArrowRight size={18} className="loop-arrow" />
          <div className="loop-step">
            <div className="loop-step-icon">
              <ShoppingCart size={22} />
              <span className="loop-step-num">3</span>
            </div>
            <strong>Restock</strong>
            <span>Shopping list fills automatically</span>
          </div>
          <ArrowRight size={18} className="loop-arrow" />
          <div className="loop-step">
            <div className="loop-step-icon">
              <Mic size={22} />
              <span className="loop-step-num">4</span>
            </div>
            <strong>Repeat</strong>
            <span>Voice-log your next haul</span>
          </div>
        </motion.div>
      </motion.section>

      {/* Section 5: Bottom CTA */}
      <motion.section
        className="landing-section landing-bottom-cta"
        initial={reduceMotion ? false : "hidden"}
        whileInView="visible"
        viewport={{ once: true, amount: 0.5 }}
        variants={stagger}
      >
        <motion.div className="bottom-cta-panel" variants={fadeUp}>
          <h2>Your kitchen, finally under control.</h2>
          <p>Free to use. No credit card needed.</p>
          <button className="get-started-button" onClick={onGetStarted}>
            {ctaLabel}
            <ArrowRight size={18} />
          </button>
        </motion.div>
      </motion.section>
    </div>
  );
};

export default LandingPage;
