/*
 * VoiceRecorder.jsx
 * Main voice recording UI and central input hub for the app. Renders mic
 * start/stop controls, a manual text entry toggle, and a receipt scanner
 * launcher. Delegates audio processing to useAudioRecorder and useVoiceProcessor
 * hooks, and displays the transcript, extracted expense result, chat response,
 * and an optional "Add to Pantry" modal after successful input.
 */
import React, { useState } from "react";
import { Mic, Square, Loader2, Type, Camera, HelpCircle } from "lucide-react";
import AddToPantryModal from "./AddToPantryModal";
import ChatResponseDisplay from "./ChatResponseDisplay";
import ReceiptScanner from "./ReceiptScanner";
import ExpenseResult from "./ExpenseResult";
import ManualInput from "./ManualInput";
import RecordingIndicator from "./RecordingIndicator";
import useAudioRecorder from "../hooks/useAudioRecorder";
import useVoiceProcessor from "../hooks/useVoiceProcessor";
import type { ShowToast, Expense } from "../types";
import "./VoiceRecorder.css";

interface Props {
  showToast: ShowToast;
  onShowTutorial?: () => void;
}

interface ReceiptResult {
  store: string;
  items: string;
  amount: number;
  date: string;
  category?: string;
  message?: string;
  expense_id?: number;
}

const VoiceRecorder: React.FC<Props> = ({ showToast, onShowTutorial }) => {
  const [manualInput, setManualInput] = useState<string>("");
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [showReceiptScanner, setShowReceiptScanner] = useState<boolean>(false);
  const [showPantryModal, setShowPantryModal] = useState<boolean>(false);

  const { isRecording, recordingTime, startRecording, stopRecording, formatTime } = useAudioRecorder();
  const processor = useVoiceProcessor();

  const handleStartRecording = async (): Promise<void> => {
    try {
      processor.clearState();
      await startRecording(processor.processAudio);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      processor.setError("Microphone access is needed. Please allow microphone permissions and try again.");
    }
  };

  const handleManualSubmit = async (): Promise<void> => {
    const success = await processor.processManualInput(manualInput);
    if (success) {
      setManualInput("");
      setShowManualInput(false);
    }
  };

  return (
    <div className="voice-recorder">
      <h2>Voxy</h2>
      <p className="recorder-description">Your personal voice powered assistant</p>
      <p className="recorder-examples">
        Try: "I bought two apples for $3 at Walmart", "What can I cook for breakfast?", "I have flour, oil, and salt", or "What should I get from the store?"
      </p>

      {onShowTutorial && (
        <button className="tutorial-replay-button" onClick={onShowTutorial}>
          <HelpCircle size={14} />
          Tutorial
        </button>
      )}

      <div className="recorder-controls">
        {!isRecording ? (
          <button className="record-button" onClick={handleStartRecording} disabled={processor.loading} data-tutorial="record-button">
            <Mic size={32} />
            <span>Start Recording</span>
          </button>
        ) : (
          <button className="stop-button" onClick={stopRecording}>
            <Square size={32} />
            <span>Stop Recording</span>
          </button>
        )}
        <button className="manual-button" onClick={() => setShowManualInput(!showManualInput)} disabled={processor.loading} data-tutorial="manual-button">
          <Type size={20} />
          <span>{showManualInput ? "Hide" : "Type"} Manual Entry</span>
        </button>
        <button className="receipt-button" onClick={() => setShowReceiptScanner(true)} disabled={processor.loading} data-tutorial="receipt-button">
          <Camera size={20} />
          <span>Scan Receipt</span>
        </button>
      </div>

      {processor.error && <div className="error-message"><p>{processor.error}</p></div>}

      {showManualInput && (
        <ManualInput
          manualInput={manualInput}
          onInputChange={setManualInput}
          onSubmit={handleManualSubmit}
          loading={processor.loading}
        />
      )}

      {processor.loading && (
        <div className="processing-indicator">
          <Loader2 className="spinner" size={24} />
          <p>Processing your voice...</p>
        </div>
      )}

      {isRecording && <RecordingIndicator recordingTime={recordingTime} formatTime={formatTime} />}

      {processor.transcript && !isRecording && (
        <div className="transcript-section">
          <h3>Transcript:</h3>
          <p className="transcript-text">{processor.transcript}</p>
        </div>
      )}

      <ExpenseResult
        extractedExpense={processor.extractedExpense}
        pendingPantryExpense={processor.pendingPantryExpense}
        showPantryModal={showPantryModal}
        onShowPantryModal={() => setShowPantryModal(true)}
        onSetPendingExpense={(expense: Expense) => { processor.setPendingPantryExpense(expense); setShowPantryModal(true); }}
      />

      {processor.chatResponse && !processor.extractedExpense && <ChatResponseDisplay chatResponse={processor.chatResponse} />}

      {showPantryModal && processor.pendingPantryExpense && (
        <AddToPantryModal
          expense={processor.pendingPantryExpense}
          onClose={() => { setShowPantryModal(false); processor.dismissPantryModal(); }}
          onSuccess={() => { setShowPantryModal(false); processor.dismissPantryModal(); }}
        />
      )}

      {showReceiptScanner && (
        <ReceiptScanner
          onClose={() => setShowReceiptScanner(false)}
          onSuccess={(result: ReceiptResult) => {
            processor.setExtractedExpense({ expenses: [result as unknown as Expense], count: 1, message: result.message });
            const category = (result.category || "").toLowerCase();
            const foodCategories = ["groceries", "grocery", "dining", "restaurant", "food"];
            if (foodCategories.some(cat => category.includes(cat))) {
              processor.setPendingPantryExpense({ ...result, id: result.expense_id } as unknown as Expense);
            }
            setShowReceiptScanner(false);
          }}
        />
      )}
    </div>
  );
};

export default VoiceRecorder;
