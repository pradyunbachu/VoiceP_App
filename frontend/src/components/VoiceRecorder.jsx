import { useState } from "react";
import { Mic, Square, Loader2, Type, Camera, HelpCircle } from "lucide-react";
import AddToPantryModal from "./AddToPantryModal";
import ChatResponseDisplay from "./ChatResponseDisplay";
import ReceiptScanner from "./ReceiptScanner";
import ExpenseResult from "./ExpenseResult";
import ManualInput from "./ManualInput";
import RecordingIndicator from "./RecordingIndicator";
import { useAuth } from "../context/AuthContext";
import { useCreateExpense, useCreateExpenseSimple, useChat, useRemovePurchasedItems } from "../hooks";
import useAudioRecorder from "../hooks/useAudioRecorder";
import { API_BASE_URL } from "../config/api";
import "./VoiceRecorder.css";

const getFriendlyError = (errorMessage) => {
  if (!errorMessage) return "Something went wrong. Please try again.";
  const msg = errorMessage.toLowerCase();
  if (msg.includes("empty message") || msg.includes("empty")) return "We couldn't catch what you said. Could you try again?";
  if (msg.includes("429") || msg.includes("quota") || msg.includes("rate limit")) return "We're getting a lot of requests right now. Please wait a moment and try again.";
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("backend")) return "Having trouble connecting. Please check your internet and try again.";
  if (msg.includes("transcription failed") || msg.includes("deepgram")) return "We couldn't catch what you said. Could you try speaking again?";
  if (msg.includes("microphone") || msg.includes("permission")) return "Microphone access is needed. Please allow microphone permissions and try again.";
  if (msg.includes("session expired") || msg.includes("401") || msg.includes("unauthorized")) return "Your session has expired. Please sign in again.";
  return "Something went wrong. Please try again.";
};

const VoiceRecorder = ({ showToast, onShowTutorial }) => {
  const { getToken } = useAuth();
  const [transcript, setTranscript] = useState("");
  const [extractedExpense, setExtractedExpense] = useState(null);
  const [chatResponse, setChatResponse] = useState(null);
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [error, setError] = useState("");
  const [showPantryModal, setShowPantryModal] = useState(false);
  const [pendingPantryExpense, setPendingPantryExpense] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showReceiptScanner, setShowReceiptScanner] = useState(false);

  const { isRecording, recordingTime, startRecording, stopRecording, formatTime } = useAudioRecorder();

  const createExpenseMutation = useCreateExpense();
  const createExpenseSimpleMutation = useCreateExpenseSimple();
  const chatMutation = useChat();
  const removePurchasedMutation = useRemovePurchasedItems();

  const loading = createExpenseMutation.isPending || createExpenseSimpleMutation.isPending || chatMutation.isPending || isTranscribing;

  const handleExpenseCreated = async (expenseData) => {
    let expenses = [];
    if (expenseData.expenses) {
      expenses = expenseData.expenses;
    } else if (expenseData.id) {
      expenses = [expenseData];
    }

    const allItems = expenses.map(exp => exp.items).filter(Boolean).join(', ');
    if (allItems) {
      try {
        await removePurchasedMutation.mutateAsync(allItems);
      } catch (error) {
        console.log('Note: Could not remove items from shopping list:', error);
      }
    }

    const foodCategories = ["groceries", "grocery", "dining", "restaurant", "food"];
    const groceryExpense = expenses.find(exp => {
      const category = (exp.category || "").toLowerCase();
      return foodCategories.some(cat => category.includes(cat));
    });

    if (groceryExpense) {
      setPendingPantryExpense(groceryExpense);
    }
  };

  const processExpenseSimple = async (transcriptText) => {
    try {
      const expenseData = await createExpenseSimpleMutation.mutateAsync(transcriptText);
      if (expenseData.expenses) {
        setExtractedExpense(expenseData);
        handleExpenseCreated(expenseData);
      } else {
        setExtractedExpense({ expenses: [expenseData], count: 1, message: expenseData.message });
        handleExpenseCreated(expenseData);
      }
    } catch (error) {
      console.error("Error with simple extraction:", error);
      setError("Could not extract expense information. Please try the manual input.");
    }
  };

  const processTranscript = async (transcriptText) => {
    setError("");
    setExtractedExpense(null);
    try {
      const expenseData = await createExpenseMutation.mutateAsync(transcriptText);
      if (expenseData.expenses) {
        setExtractedExpense(expenseData);
        handleExpenseCreated(expenseData);
      } else {
        setExtractedExpense({ expenses: [expenseData], count: 1, message: expenseData.message });
        handleExpenseCreated(expenseData);
      }
    } catch (error) {
      console.error("Error processing transcript:", error);
      setError(getFriendlyError(error.message));
      if (error.message?.includes("429") || error.message?.includes("quota")) {
        await processExpenseSimple(transcriptText);
      } else if (error.message !== "Failed to fetch") {
        try { await processExpenseSimple(transcriptText); } catch (e) {
          setError("Something went wrong. Please try again or use manual input.");
        }
      }
    }
  };

  const processAudio = async (audioBlob, mimeType = "audio/webm") => {
    setIsTranscribing(true);
    setTranscript("");
    setExtractedExpense(null);
    setChatResponse(null);

    try {
      const token = getToken();
      const formData = new FormData();
      let extension = "webm";
      if (mimeType.includes("mp4")) extension = "mp4";
      else if (mimeType.includes("ogg")) extension = "ogg";
      formData.append("audio", audioBlob, `recording.${extension}`);

      const transcribeHeaders = {};
      if (token) transcribeHeaders["Authorization"] = `Bearer ${token}`;

      const transcriptResponse = await fetch(`${API_BASE_URL}/api/transcribe`, {
        method: "POST",
        headers: transcribeHeaders,
        credentials: "include",
        body: formData,
      });

      if (!transcriptResponse.ok) {
        const errorText = await transcriptResponse.text();
        throw new Error(`Deepgram transcription failed: ${transcriptResponse.status} - ${errorText}`);
      }

      const transcriptData = await transcriptResponse.json();
      const transcriptText = (transcriptData.transcript || "").trim();
      setTranscript(transcriptText);
      setIsTranscribing(false);

      if (!transcriptText) {
        setError("We couldn't catch what you said. Could you try speaking again?");
        return;
      }

      const chatResult = await chatMutation.mutateAsync(transcriptText);

      if (chatResult.intent === "expense_input" && chatResult.data?.route_to_expense) {
        const expenseData = await createExpenseMutation.mutateAsync(transcriptText);
        setExtractedExpense(expenseData);
        handleExpenseCreated(expenseData);
      } else {
        setChatResponse(chatResult);
      }
    } catch (error) {
      console.error("Error processing audio:", error);
      setError(getFriendlyError(error.message || "Unknown error occurred"));
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualInput.trim()) { setError("Please enter your message"); return; }
    setError(""); setTranscript(""); setExtractedExpense(null); setChatResponse(null);

    try {
      const chatResult = await chatMutation.mutateAsync(manualInput);
      if (chatResult.intent === "expense_input" && chatResult.data?.route_to_expense) {
        const expenseData = await createExpenseMutation.mutateAsync(manualInput);
        setExtractedExpense(expenseData);
        handleExpenseCreated(expenseData);
      } else {
        setChatResponse(chatResult);
      }
      setManualInput("");
      setShowManualInput(false);
    } catch (error) {
      console.error("Error processing manual input:", error);
      setError(getFriendlyError(error.message));
    }
  };

  const handleStartRecording = async () => {
    try {
      setTranscript("");
      setError("");
      await startRecording(processAudio);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setError(getFriendlyError("microphone permission"));
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
          <button className="record-button" onClick={handleStartRecording} disabled={loading} data-tutorial="record-button">
            <Mic size={32} />
            <span>Start Recording</span>
          </button>
        ) : (
          <button className="stop-button" onClick={stopRecording}>
            <Square size={32} />
            <span>Stop Recording</span>
          </button>
        )}
        <button className="manual-button" onClick={() => setShowManualInput(!showManualInput)} disabled={loading} data-tutorial="manual-button">
          <Type size={20} />
          <span>{showManualInput ? "Hide" : "Type"} Manual Entry</span>
        </button>
        <button className="receipt-button" onClick={() => setShowReceiptScanner(true)} disabled={loading} data-tutorial="receipt-button">
          <Camera size={20} />
          <span>Scan Receipt</span>
        </button>
      </div>

      {error && <div className="error-message"><p>{error}</p></div>}

      {showManualInput && (
        <ManualInput
          manualInput={manualInput}
          onInputChange={setManualInput}
          onSubmit={handleManualSubmit}
          loading={loading}
        />
      )}

      {loading && (
        <div className="processing-indicator">
          <Loader2 className="spinner" size={24} />
          <p>Processing your voice...</p>
        </div>
      )}

      {isRecording && <RecordingIndicator recordingTime={recordingTime} formatTime={formatTime} />}

      {transcript && !isRecording && (
        <div className="transcript-section">
          <h3>Transcript:</h3>
          <p className="transcript-text">{transcript}</p>
        </div>
      )}

      <ExpenseResult
        extractedExpense={extractedExpense}
        pendingPantryExpense={pendingPantryExpense}
        showPantryModal={showPantryModal}
        onShowPantryModal={() => setShowPantryModal(true)}
        onSetPendingExpense={(expense) => { setPendingPantryExpense(expense); setShowPantryModal(true); }}
      />

      {chatResponse && !extractedExpense && <ChatResponseDisplay chatResponse={chatResponse} />}

      {showPantryModal && pendingPantryExpense && (
        <AddToPantryModal
          expense={pendingPantryExpense}
          onClose={() => { setShowPantryModal(false); setPendingPantryExpense(null); }}
          onSuccess={() => { setShowPantryModal(false); setPendingPantryExpense(null); }}
        />
      )}

      {showReceiptScanner && (
        <ReceiptScanner
          onClose={() => setShowReceiptScanner(false)}
          onSuccess={(result) => {
            setExtractedExpense({ expenses: [result], count: 1, message: result.message });
            const category = (result.category || "").toLowerCase();
            const foodCategories = ["groceries", "grocery", "dining", "restaurant", "food"];
            if (foodCategories.some(cat => category.includes(cat))) {
              setPendingPantryExpense({ ...result, id: result.expense_id });
            }
            setShowReceiptScanner(false);
          }}
        />
      )}
    </div>
  );
};

export default VoiceRecorder;
