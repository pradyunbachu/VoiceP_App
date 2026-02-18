/*
 * ManualInput.jsx
 * Text-based alternative to voice recording for logging expenses or asking
 * questions. Renders a multi-line textarea with placeholder examples and a
 * submit button. The button is disabled while processing or when the input
 * is empty, providing clear affordance to the user.
 */
const ManualInput = ({ manualInput, onInputChange, onSubmit, loading }) => {
  return (
    <div className="manual-input-section">
      <h3>Type Your Message</h3>
      <textarea
        className="manual-textarea"
        value={manualInput}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="Examples: 'I spent $20 at Walmart', 'How many eggs do I have?', 'What can I cook?', 'What should I get from the store?'"
        rows={4}
        disabled={loading}
      />
      <button
        className="submit-manual-button"
        onClick={onSubmit}
        disabled={loading || !manualInput.trim()}>
        {loading ? "Processing..." : "Submit"}
      </button>
    </div>
  );
};

export default ManualInput;
