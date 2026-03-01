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
      <section className="landing-hero">
        <div className="landing-hero-content">
          <Mic size={48} className="logo-icon" />
          <h1 className="landing-title">voxal</h1>
          <p className="landing-tagline">
            Stop wasting food and money on groceries.
          </p>
          <p className="landing-description">
            Say what you bought. We track the spending, stock your pantry, and
            tell you what to cook before anything expires.
          </p>
          {!isAuthenticated ? (
            <button className="get-started-button" onClick={onGetStarted}>
              Get Started
            </button>
          ) : (
            <button className="get-started-button" onClick={onGetStarted}>
              Go to Dashboard
            </button>
          )}
          <div className="highlight-pills">
            <div className="highlight-pill">
              <Mic size={16} />
              <span>Voice-First</span>
            </div>
            <div className="highlight-pill">
              <Package size={16} />
              <span>Smart Pantry</span>
            </div>
            <div className="highlight-pill">
              <ChefHat size={16} />
              <span>Meal Recipes</span>
            </div>
            <div className="highlight-pill">
              <TrendingDown size={16} />
              <span>Grocery Insights</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: One sentence does it all */}
      <section className="landing-section landing-voice-demo">
        <h2 className="landing-section-title">One sentence does it all</h2>
        <div className="voice-demo-container">
          <div className="voice-bubble">
            <Mic size={20} className="voice-bubble-icon" />
            <span>
              "I bought chicken, rice, and broccoli at Costco for $22"
            </span>
          </div>
          <div className="connector-line" />
          <div className="result-cards">
            <div className="result-card result-card-blue">
              <div className="result-card-icon blue">
                <TrendingDown size={18} />
              </div>
              <div className="result-card-text">
                <strong>Expense Logged</strong>
                <span>$22 at Costco, filed under Groceries</span>
              </div>
            </div>
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
          </div>
        </div>
      </section>

      {/* Section 3: Feature cards */}
      <section className="landing-section landing-features">
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon blue">
              <Package size={24} />
            </div>
            <h3>Smart Pantry</h3>
            <p>
              Know exactly what you have. See expiration dates at a glance. No
              more buying duplicates or throwing out food.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon purple">
              <ChefHat size={24} />
            </div>
            <h3>Recipe Suggestions</h3>
            <p>
              Ask what you can cook tonight. Get answers based on what's actually
              in your pantry.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon amber">
              <ShoppingCart size={24} />
            </div>
            <h3>Shared Shopping Lists</h3>
            <p>
              Auto-generated from meal plans. Share with your partner or
              roommates.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon red">
              <TrendingDown size={24} />
            </div>
            <h3>Grocery Spending Insights</h3>
            <p>
              See where your grocery money goes. Track by store, category, and
              week.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: The Loop */}
      <section className="landing-section landing-loop">
        <h2 className="landing-section-title">The Loop</h2>
        <div className="loop-steps">
          <div className="loop-step">
            <div className="loop-step-icon">
              <Mic size={24} />
            </div>
            <strong>Speak</strong>
            <span>Log groceries with your voice</span>
          </div>
          <ArrowRight size={20} className="loop-arrow" />
          <div className="loop-step">
            <div className="loop-step-icon">
              <Package size={24} />
            </div>
            <strong>Auto-sorted</strong>
            <span>Pantry + expenses update instantly</span>
          </div>
          <ArrowRight size={20} className="loop-arrow" />
          <div className="loop-step">
            <div className="loop-step-icon">
              <ChefHat size={24} />
            </div>
            <strong>Get recipes</strong>
            <span>Based on what you already have</span>
          </div>
          <ArrowRight size={20} className="loop-arrow" />
          <div className="loop-step">
            <div className="loop-step-icon">
              <ShoppingCart size={24} />
            </div>
            <strong>Shop smart</strong>
            <span>List updates for next trip</span>
          </div>
        </div>
      </section>

      {/* Section 5: Bottom CTA */}
      <section className="landing-section landing-bottom-cta">
        <h2>Your groceries, finally under control.</h2>
        <p>Free to use. No credit card needed.</p>
        {!isAuthenticated ? (
          <button className="get-started-button" onClick={onGetStarted}>
            Get Started
          </button>
        ) : (
          <button className="get-started-button" onClick={onGetStarted}>
            Go to Dashboard
          </button>
        )}
      </section>
    </div>
  );
};

export default LandingPage;
