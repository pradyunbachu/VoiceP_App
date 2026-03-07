import type { FC } from "react";
import "./MixingBowlLoader.css";

interface Props {
  size?: "sm" | "md" | "lg";
  label?: string;
}

const MixingBowlLoader: FC<Props> = ({ size = "md", label }) => (
  <div className={`bowl-loader bowl-loader--${size}`}>
    <div className="bowl-scene">
      {/* Spoon / whisk handle */}
      <div className="bowl-spoon" />
      {/* The bowl */}
      <div className="bowl-body">
        <div className="bowl-contents">
          <div className="bowl-bubble bowl-bubble--1" />
          <div className="bowl-bubble bowl-bubble--2" />
          <div className="bowl-bubble bowl-bubble--3" />
        </div>
      </div>
    </div>
    {label && <span className="bowl-loader-label">{label}</span>}
  </div>
);

export default MixingBowlLoader;
