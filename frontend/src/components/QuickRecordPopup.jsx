import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Loader2, Check, X, Package, AlertCircle, MessageCircle } from "lucide-react";
import AddToPantryModal from "./AddToPantryModal";
import { useAuth } from "../context/AuthContext";
import { useCreateExpense, useCreateExpenseSimple, useChat } from "../hooks";
import { API_BASE_URL } from "../config/api";
import "./QuickRecordPopup.css";

const QuickRecordPopup = ({ showToast }) => {
  const { getToken } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [extractedExpense, setExtractedExpense] = useState(null);
  const [chatResponse, setChatResponse] = useState(null);
  const [error, setError] = useState("");
  const [showPantryModal, setShowPantryModal] = useState(false);
  const [pendingPantryExpense, setPendingPantryExpense] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const isSpaceHeldRef = useRef(false);

  // React Query mutations
  const createExpenseMutation = useCreateExpense();
  const createExpenseSimpleMutation = useCreateExpenseSimple();
  const chatMutation = useChat();

  // Combined processing state
  const isProcessing = createExpenseMutation.isPending || createExpenseSimpleMutation.isPending || chatMutation.isPending || isTranscribing;

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const checkForPantryItems = (expenseData) => {
    let expenses = [];
    if (expenseData.expenses) {
      expenses = expenseData.expenses;
    } else if (expenseData.id) {
      expenses = [expenseData];
    }

    const groceryExpense = expenses.find((exp) => {
      const category = (exp.category || "").toLowerCase();
      return category.includes("groceries") || category.includes("grocery");
    });

    if (groceryExpense) {
      setPendingPantryExpense(groceryExpense);
    }
  };

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing) return;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("MediaRecorder is not available in this browser");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blobType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        await processAudio(audioBlob, blobType);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsVisible(true);
      setError("");
      setExtractedExpense(null);
      setPendingPantryExpense(null);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setError("Microphone access denied");
      setIsVisible(true);
    }
  }, [isRecording, isProcessing]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const processAudio = async (audioBlob, mimeType = "audio/webm") => {
    setIsTranscribing(true);
    setChatResponse(null);

    try {
      const token = getToken();

      // Step 1: Transcribe
      const formData = new FormData();
      let extension = "webm";
      if (mimeType.includes("mp4")) extension = "mp4";
      else if (mimeType.includes("ogg")) extension = "ogg";

      formData.append("audio", audioBlob, `recording.${extension}`);

      const transcribeHeaders = {};
      if (token) {
        transcribeHeaders["Authorization"] = `Bearer ${token}`;
      }

      const transcriptResponse = await fetch(
        `${API_BASE_URL}/api/transcribe`,
        {
          method: "POST",
          headers: transcribeHeaders,
          credentials: "include",
          body: formData,
        }
      );

      if (!transcriptResponse.ok) {
        throw new Error("Transcription failed");
      }

      const transcriptData = await transcriptResponse.json();
      setIsTranscribing(false);

      // Step 2: Send to chat endpoint for intent detection
      const chatResult = await chatMutation.mutateAsync(transcriptData.transcript);

      // Step 3: Route based on intent
      if (chatResult.intent === "expense_input" && chatResult.data?.route_to_expense) {
        // Process as expense input
        try {
          const expenseData = await createExpenseMutation.mutateAsync(transcriptData.transcript);
          handleExpenseData(expenseData);
        } catch (extractError) {
          // Try simple extraction fallback
          const expenseData = await createExpenseSimpleMutation.mutateAsync(transcriptData.transcript);
          handleExpenseData(expenseData);
        }
      } else {
        // Display chat response for queries/suggestions
        setChatResponse(chatResult);
      }
    } catch (error) {
      console.error("Error processing audio:", error);
      setError(error.message || "Failed to process recording");
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleExpenseData = (expenseData) => {
    if (expenseData.expenses) {
      setExtractedExpense(expenseData);
      checkForPantryItems(expenseData);
    } else {
      setExtractedExpense({
        expenses: [expenseData],
        count: 1,
        message: expenseData.message,
      });
      checkForPantryItems(expenseData);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setExtractedExpense(null);
    setChatResponse(null);
    setError("");
    setPendingPantryExpense(null);
  };

  const handleConfirm = () => {
    handleDismiss();
  };

  // Global spacebar listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input/textarea
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      ) {
        return;
      }

      if (e.code === "Space" && !isSpaceHeldRef.current && !isProcessing && !extractedExpense && !chatResponse) {
        e.preventDefault();
        isSpaceHeldRef.current = true;
        startRecording();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === "Space" && isSpaceHeldRef.current) {
        e.preventDefault();
        isSpaceHeldRef.current = false;
        if (isRecording) {
          stopRecording();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startRecording, stopRecording, isRecording, isProcessing, extractedExpense, chatResponse]);

  if (!isVisible) return null;

  return (
    <>
      <div className="quick-record-overlay" onClick={handleDismiss}>
        <div
          className="quick-record-popup"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Recording State */}
          {isRecording && (
            <div className="quick-record-recording">
              <div className="recording-pulse">
                <Mic size={32} />
              </div>
              <div className="recording-time">{formatTime(recordingTime)}</div>
              <p className="recording-hint">Release spacebar to stop</p>
            </div>
          )}

          {/* Processing State */}
          {isProcessing && (
            <div className="quick-record-processing">
              <Loader2 className="spinner" size={32} />
              <p>Processing...</p>
            </div>
          )}

          {/* Error State */}
          {error && !isRecording && !isProcessing && (
            <div className="quick-record-error">
              <AlertCircle size={32} />
              <p>{error}</p>
              <button className="dismiss-btn" onClick={handleDismiss}>
                Dismiss
              </button>
            </div>
          )}

          {/* Result State */}
          {extractedExpense && !isProcessing && (
            <div className="quick-record-result">
              <h3>Expense Added</h3>
              {extractedExpense.expenses.map((expense, index) => (
                <div key={expense.id || index} className="expense-item">
                  <div className="expense-row">
                    <span className="expense-label">Store</span>
                    <span className="expense-value">{expense.store}</span>
                  </div>
                  <div className="expense-row">
                    <span className="expense-label">Items</span>
                    <span className="expense-value">{expense.items}</span>
                  </div>
                  <div className="expense-row">
                    <span className="expense-label">Amount</span>
                    <span className="expense-value expense-amount">
                      ${expense.amount?.toFixed(2)}
                    </span>
                  </div>
                  {expense.category && (
                    <div className="expense-row">
                      <span className="expense-label">Category</span>
                      <span className="expense-value">{expense.category}</span>
                    </div>
                  )}
                </div>
              ))}

              <div className="quick-record-actions">
                <button className="confirm-btn" onClick={handleConfirm}>
                  <Check size={18} />
                  <span>Done</span>
                </button>
                {pendingPantryExpense && (
                  <button
                    className="pantry-btn"
                    onClick={() => setShowPantryModal(true)}
                  >
                    <Package size={18} />
                    <span>Add to Pantry</span>
                  </button>
                )}
                <button className="dismiss-btn" onClick={handleDismiss}>
                  <X size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Chat Response State */}
          {chatResponse && !isProcessing && !extractedExpense && (
            <div className="quick-record-result quick-record-chat">
              <h3>
                <MessageCircle size={20} />
                <span>
                  {chatResponse.intent === "pantry_query" && "Pantry"}
                  {chatResponse.intent === "expense_query" && "Spending"}
                  {chatResponse.intent === "suggestion" && "Shopping List"}
                  {chatResponse.intent === "general" && "Help"}
                </span>
              </h3>
              <div className="chat-response-text">
                {chatResponse.response_text.split("\n").map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
              </div>
              <div className="quick-record-actions">
                <button className="confirm-btn" onClick={handleDismiss}>
                  <Check size={18} />
                  <span>Done</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pantry Modal */}
      {showPantryModal && pendingPantryExpense && (
        <AddToPantryModal
          expense={pendingPantryExpense}
          onClose={() => {
            setShowPantryModal(false);
            setPendingPantryExpense(null);
          }}
          onSuccess={() => {
            setShowPantryModal(false);
            setPendingPantryExpense(null);
            handleDismiss();
          }}
        />
      )}
    </>
  );
};

export default QuickRecordPopup;
