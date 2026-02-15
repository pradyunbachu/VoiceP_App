import { Mic, BarChart3, Wallet, Sparkles, LogIn, Keyboard, Package, RefreshCw, Camera, ShoppingCart, Lightbulb, UtensilsCrossed } from "lucide-react";
import "./LandingPage.css";

const LandingPage = ({ onGetStarted, onLogin, isAuthenticated = false }) => {
  const features = [
    {
      icon: <Mic size={32} />,
      title: "Voice Recording",
      description: "Record expenses naturally with your voice. AI automatically extracts store, items, amount, and category."
    },
    {
      icon: <Keyboard size={32} />,
      title: "Quick Record Anywhere",
      description: "Hold spacebar from any screen to instantly record an expense. Release to process and save."
    },
    {
      icon: <Camera size={32} />,
      title: "Receipt Scanner",
      description: "Snap a photo or upload a receipt. AI reads and extracts all items and totals automatically via OCR."
    },
    {
      icon: <Package size={32} />,
      title: "Smart Pantry",
      description: "Track groceries with visual shelves. Drag and drop items between categories, monitor expiration dates and stock levels."
    },
    {
      icon: <UtensilsCrossed size={32} />,
      title: "Voxy's Meal Recommendations",
      description: "Get AI-powered meal suggestions based on what's in your pantry. Prioritizes ingredients near expiration."
    },
    {
      icon: <ShoppingCart size={32} />,
      title: "Smart Shopping Lists",
      description: "Build grocery lists with autocomplete and share them with groups. AI matches items to your pantry in real time."
    },
    {
      icon: <BarChart3 size={32} />,
      title: "Analytics Dashboard",
      description: "Visualize spending with interactive charts. See trends over time, top stores, and category breakdowns."
    },
    {
      icon: <Lightbulb size={32} />,
      title: "AI Spending Insights",
      description: "Get AI-generated analysis of your spending patterns with personalized trends and recommendations."
    },
    {
      icon: <Wallet size={32} />,
      title: "Budget Tracking",
      description: "Set monthly budgets by category with alerts when approaching limits. Supports recurring budgets."
    },
    {
      icon: <RefreshCw size={32} />,
      title: "Recurring Expenses",
      description: "Automatically detect and track subscriptions and recurring payments like rent, gym, and streaming services."
    }
  ];

  return (
    <div className="landing-page">
      {!isAuthenticated && onLogin && (
        <button className="landing-login-button" onClick={onLogin}>
          <LogIn size={18} />
          <span>Login</span>
        </button>
      )}
      <div className="landing-content">
        <div className="landing-logo">
          <Mic size={80} className="logo-icon" />
          <h1>voxal</h1>
          <p className="landing-tagline">Your Voice Powered Personal Assistant</p>
          <p className="landing-description">
            Voice-powered expense tracking, pantry management, meal planning, and smart shopping — all in one place.
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
        </div>

        <div className="features-section">
          <h2 className="features-title">
            <Sparkles size={24} />
            <span>Key Features</span>
          </h2>
          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;

