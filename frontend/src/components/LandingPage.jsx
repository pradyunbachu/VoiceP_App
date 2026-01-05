import { Mic, BarChart3, List, Wallet, Sparkles } from "lucide-react";
import "./LandingPage.css";

const LandingPage = ({ onGetStarted, isAuthenticated = false }) => {
  const features = [
    {
      icon: <Mic size={32} />,
      title: "Voice Recording",
      description: "Record expenses using your microphone. Just speak naturally about your purchase."
    },
    {
      icon: <BarChart3 size={32} />,
      title: "Analytics Dashboard",
      description: "Visualize your spending with interactive charts and detailed analytics."
    },
    {
      icon: <List size={32} />,
      title: "Expense Management",
      description: "View, edit, and organize all your expenses with powerful filtering and sorting."
    },
    {
      icon: <Wallet size={32} />,
      title: "Budget Tracking",
      description: "Set monthly budgets by category and track your spending against them."
    }
  ];

  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="landing-logo">
          <Mic size={80} className="logo-icon" />
          <h1>Voxalyze</h1>
          <p className="landing-tagline">Voice Powered Expense Tracker</p>
          <p className="landing-description">
            Simply speak about your purchases and let AI extract all the details automatically.
            Track your expenses effortlessly with voice commands and powerful analytics.
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

