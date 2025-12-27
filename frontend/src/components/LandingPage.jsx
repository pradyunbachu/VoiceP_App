import { Mic } from "lucide-react";
import "./LandingPage.css";

const LandingPage = ({ onGetStarted }) => {
  return (
    <div className="landing-page">
      <div className="landing-content">
        <div className="landing-logo">
          <Mic size={80} className="logo-icon" />
          <h1>Voxalyze</h1>
          <p className="landing-tagline">Voice Powered Expense Tracker</p>
          <p className="landing-description">
            Simply speak about your purchases and let AI extract all the details.
            Track your expenses effortlessly with voice commands.
          </p>
          <button className="get-started-button" onClick={onGetStarted}>
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;

