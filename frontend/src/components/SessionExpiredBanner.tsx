import type { FC } from "react";
import { LogIn } from "lucide-react";
import "./SessionExpiredBanner.css";

interface Props {
  onSignIn: () => void;
}

const SessionExpiredBanner: FC<Props> = ({ onSignIn }) => (
  <div className="session-banner">
    <span>Your session has expired.</span>
    <button className="session-banner-btn" onClick={onSignIn}>
      <LogIn size={14} />
      Sign in
    </button>
  </div>
);

export default SessionExpiredBanner;
