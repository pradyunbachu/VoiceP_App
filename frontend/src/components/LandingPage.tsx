/*
 * LandingPage.jsx
 * Public marketing page shown before the user logs in. Composed of a hero
 * section with tagline and CTA, a voice-demo showing how one sentence logs
 * an expense / updates the pantry / checks off a shopping list, a feature
 * card grid (Smart Pantry, Recipes, Shopping Lists, Insights), a step-by-step
 * "Loop" flow diagram, and a bottom call-to-action. Adapts the primary CTA
 * label based on authentication state.
 */
import type { FC } from "react";
import { motion } from "framer-motion";
import {
  Mic,
  LogIn,
  Package,
  UtensilsCrossed,
  ShoppingCart,
  ArrowRight,
  TrendingDown,
  ChefHat,
} from "lucide-react";
import "./LandingPage.css";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

interface Props {
  onGetStarted: () => void;
  onLogin?: () => void;
  isAuthenticated?: boolean;
}

const LandingPage: FC<Props> = ({ onGetStarted, onLogin, isAuthenticated = false }) => {
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
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        <div className="landing-hero-content">
          <motion.div variants={fadeUp}>
            <Mic size={48} className="logo-icon" />
          </motion.div>
          <motion.h1 className="landing-title" variants={fadeUp}>voxal</motion.h1>
          <motion.p className="landing-tagline" variants={fadeUp}>
            Your kitchen, organized by voice.
          </motion.p>
          <motion.p className="landing-description" variants={fadeUp}>
            Track what's in your pantry, get recipes before food expires,
            and keep your shopping list in sync — all with one sentence.
          </motion.p>
          {!isAuthenticated ? (
            <button className="get-started-button" onClick={onGetStarted}>
              Get Started
            </button>
          ) : (
            <button className="get-started-button" onClick={onGetStarted}>
              Go to Dashboard
            </button>
          )}
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

      {/* Section 2: One sentence does it all */}
      <motion.section
        className="landing-section landing-voice-demo"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={stagger}
      >
        <motion.h2 className="landing-section-title" variants={fadeUp}>One sentence does it all</motion.h2>
        <motion.div className="voice-demo-container" variants={fadeUp}>
          <div className="voice-bubble">
            <Mic size={20} className="voice-bubble-icon" />
            <span>
              "I bought chicken, rice, and broccoli at Costco for $22"
            </span>
          </div>
          <div className="connector-line" />
          <div className="result-cards">
            <div className="result-card result-card-purple">
              <div className="result-card-icon purple">
                <Package size={18} />
              </div>
              <div className="result-card-text">
                <strong>Pantry Updated</strong>
                <span>3 items added with expiration tracking</span>
              </div>
            </div>
            <div className="result-card result-card-amber">
              <div className="result-card-icon amber">
                <ShoppingCart size={18} />
              </div>
              <div className="result-card-text">
                <strong>List Updated</strong>
                <span>Items auto-checked off your shopping list</span>
              </div>
            </div>
            <div className="result-card result-card-blue">
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
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={stagger}
      >
        <div className="feature-grid">
          <motion.div className="feature-card" variants={fadeUp}>
            <div className="feature-icon blue">
              <Package size={24} />
            </div>
            <h3>Smart Pantry</h3>
            <p>
              Know exactly what you have. See expiration dates at a glance. No
              more buying duplicates or throwing out food.
            </p>
          </motion.div>
          <motion.div className="feature-card" variants={fadeUp}>
            <div className="feature-icon purple">
              <ChefHat size={24} />
            </div>
            <h3>Recipe Suggestions</h3>
            <p>
              Ask what you can cook tonight. Get answers based on what's actually
              in your pantry.
            </p>
          </motion.div>
          <motion.div className="feature-card" variants={fadeUp}>
            <div className="feature-icon amber">
              <ShoppingCart size={24} />
            </div>
            <h3>Shared Shopping Lists</h3>
            <p>
              Auto-generated from meal plans. Share with your partner or
              roommates.
            </p>
          </motion.div>
          <motion.div className="feature-card" variants={fadeUp}>
            <div className="feature-icon red">
              <TrendingDown size={24} />
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
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={stagger}
      >
        <motion.h2 className="landing-section-title" variants={fadeUp}>The Loop</motion.h2>
        <motion.div className="loop-steps" variants={fadeUp}>
          <div className="loop-step">
            <div className="loop-step-icon">
              <Package size={24} />
            </div>
            <strong>Stock up</strong>
            <span>Add groceries to your pantry</span>
          </div>
          <ArrowRight size={20} className="loop-arrow" />
          <div className="loop-step">
            <div className="loop-step-icon">
              <ChefHat size={24} />
            </div>
            <strong>Cook</strong>
            <span>Get recipes from what you have</span>
          </div>
          <ArrowRight size={20} className="loop-arrow" />
          <div className="loop-step">
            <div className="loop-step-icon">
              <ShoppingCart size={24} />
            </div>
            <strong>Restock</strong>
            <span>Shopping list fills automatically</span>
          </div>
          <ArrowRight size={20} className="loop-arrow" />
          <div className="loop-step">
            <div className="loop-step-icon">
              <Mic size={24} />
            </div>
            <strong>Repeat</strong>
            <span>Voice-log your next haul</span>
          </div>
        </motion.div>
      </motion.section>

      {/* Section 5: Bottom CTA */}
      <motion.section
        className="landing-section landing-bottom-cta"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.5 }}
        variants={stagger}
      >
        <motion.h2 variants={fadeUp}>Your kitchen, finally under control.</motion.h2>
        <motion.p variants={fadeUp}>Free to use. No credit card needed.</motion.p>
        {!isAuthenticated ? (
          <button className="get-started-button" onClick={onGetStarted}>
            Get Started
          </button>
        ) : (
          <button className="get-started-button" onClick={onGetStarted}>
            Go to Dashboard
          </button>
        )}
      </motion.section>
    </div>
  );
};

export default LandingPage;
