const RecordingIndicator = ({ recordingTime, formatTime }) => {
  return (
    <div className="recording-indicator">
      <div className="recording-timer">{formatTime(recordingTime)}</div>
      <div className="recording-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <p className="recording-text">Recording... Speak now</p>
    </div>
  );
};

export default RecordingIndicator;
