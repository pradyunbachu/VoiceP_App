import type { FC } from "react";
import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import "./SessionExpiredBanner.css";

interface Props {
  onSignIn: () => void;
}

const SessionExpiredBanner: FC<Props> = ({ onSignIn }) => (
  <motion.div
    className="session-banner"
    initial={{ y: -60, opacity: 0 }}
    animate={{ y: 0, opacity: 1 }}
    transition={{ type: "spring", stiffness: 300, damping: 25 }}
  >
    <span>Your session has expired.</span>
    <button className="session-banner-btn" onClick={onSignIn}>
      <LogIn size={14} />
      Sign in
    </button>
  </motion.div>
);

export default SessionExpiredBanner;
