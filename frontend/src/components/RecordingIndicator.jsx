/*
 * RecordingIndicator.jsx
 * Visual feedback component displayed while the microphone is actively
 * recording. Shows an elapsed-time counter, animated pulsing dots, and
 * a "Recording... Speak now" prompt to guide the user.
 */
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
