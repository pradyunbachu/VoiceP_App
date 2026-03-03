/*
 * VoiceRecorder.jsx
 * Main voice recording UI and central input hub for the app. Renders mic
 * start/stop controls, a manual text entry toggle, and a receipt scanner
 * launcher. Delegates audio processing to useAudioRecorder and useVoiceProcessor
 * hooks, and displays the transcript, extracted expense result, chat response,
 * and an optional "Add to Pantry" modal after successful input.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Square, Loader2, Type, Camera, HelpCircle, Zap, X, AlertTriangle } from "lucide-react";
import AddToPantryModal from "./AddToPantryModal";
import ChatResponseDisplay from "./ChatResponseDisplay";
import ReceiptScanner from "./ReceiptScanner";
import ExpenseResult from "./ExpenseResult";
import ManualInput from "./ManualInput";
import RecordingIndicator from "./RecordingIndicator";
import useAudioRecorder from "../hooks/useAudioRecorder";
import useVoiceProcessor from "../hooks/useVoiceProcessor";
import { useStreak, usePantryStats, usePantryItems } from "../hooks";
import { isExpiringSoon } from "../lib/pantryUtils";
import type { ShowToast, Expense, PantryItem } from "../types";
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

  const [showSpacebarTip, setShowSpacebarTip] = useState<boolean>(
    () => !localStorage.getItem("voxal_spacebar_tip_dismissed")
  );

  const { isRecording, recordingTime, startRecording, stopRecording, formatTime } = useAudioRecorder();
  const processor = useVoiceProcessor();
  const { data: streakData } = useStreak();
  const { data: pantryStats } = usePantryStats();
  const { data: pantryItems } = usePantryItems({ sort_by: 'expiration_date', sort_order: 'asc' });
  const [showExpiring, setShowExpiring] = useState(false);

  const expiringItems = (Array.isArray(pantryItems) ? pantryItems : []).filter(
    (item: PantryItem) => isExpiringSoon(item.expiration_date)
  );
  const prevExpenseCountRef = useRef(processor.expenseJustCreated);

  const dismissSpacebarTip = useCallback(() => {
    setShowSpacebarTip(false);
    localStorage.setItem("voxal_spacebar_tip_dismissed", "1");
  }, []);

  // Celebration toast when an expense is created
  useEffect(() => {
    if (processor.expenseJustCreated === 0 || processor.expenseJustCreated === prevExpenseCountRef.current) return;
    prevExpenseCountRef.current = processor.expenseJustCreated;

    // Build toast message from the latest extracted expense
    const expenses = processor.extractedExpense?.expenses;
    const totalAmount = expenses?.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const amountStr = totalAmount ? `$${totalAmount.toFixed(2)} logged` : "Expense logged";

    const streak = streakData?.current_streak ?? 0;
    const streakStr = streak > 1 ? ` — ${streak}-day streak` : "";

    // Check for milestone crossings
    const total = streakData?.total_expenses ?? 0;
    const milestones = [500, 250, 100, 50, 25, 10];
    const milestone = milestones.find((m) => total >= m && total - (expenses?.length ?? 1) < m);

    if (milestone) {
      showToast(`${milestone} expenses! ${amountStr}${streakStr}`, "celebration", 5000);
    } else {
      showToast(`${amountStr}${streakStr}`, "celebration", 4000);
    }
  }, [processor.expenseJustCreated]);

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

      {showSpacebarTip && (
        <div className="spacebar-tip">
          <Zap size={13} />
          <span>Pro tip: hold <kbd>spacebar</kbd> to quick-record from anywhere</span>
          <button className="spacebar-tip-dismiss" onClick={dismissSpacebarTip} aria-label="Dismiss tip">
            <X size={12} />
          </button>
        </div>
      )}

      {(streakData || pantryStats?.expiring_soon) ? (
        <div className="recorder-glance">
          {streakData && (
            <span className="glance-chip streak">
              {streakData.current_streak > 0 ? `${streakData.current_streak}-day streak` : 'Start your streak!'}
            </span>
          )}
          {pantryStats && pantryStats.expiring_soon > 0 && (
            <div className="glance-expiring-wrapper">
              <button className={`glance-chip expiring ${showExpiring ? 'active' : ''}`} onClick={() => setShowExpiring(!showExpiring)}>
                <AlertTriangle size={12} />
                {pantryStats.expiring_soon} expiring soon
              </button>
              {showExpiring && expiringItems.length > 0 && (
                <>
                  <div className="glance-expiring-backdrop" onClick={() => setShowExpiring(false)} />
                  <div className="glance-expiring-list">
                    <div className="glance-expiring-header">
                      <span>Expiring Soon</span>
                      <button className="glance-expiring-close" onClick={() => setShowExpiring(false)} aria-label="Close">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="glance-expiring-items">
                      {expiringItems.map((item) => {
                        const daysLeft = Math.ceil(
                          (new Date(item.expiration_date!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                        );
                        return (
                          <div key={item.id} className="glance-expiring-item">
                            <span className="glance-expiring-name">{item.name}</span>
                            <span className={`glance-expiring-days ${daysLeft <= 1 ? 'urgent' : ''}`}>
                              {item.expiration_predicted ? '~' : ''}{daysLeft <= 0 ? 'today' : daysLeft === 1 ? 'tomorrow' : `${daysLeft}d left`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}

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
