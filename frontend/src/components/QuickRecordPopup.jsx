import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Loader2, Check, X, Package, AlertCircle } from "lucide-react";
import AddToPantryModal from "./AddToPantryModal";
import "./QuickRecordPopup.css";

const QuickRecordPopup = ({ token, onExpenseAdded, showToast }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [extractedExpense, setExtractedExpense] = useState(null);
  const [error, setError] = useState("");
  const [showPantryModal, setShowPantryModal] = useState(false);
  const [pendingPantryExpense, setPendingPantryExpense] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const isSpaceHeldRef = useRef(false);

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
    setIsProcessing(true);

    try {
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
        "http://localhost:8000/api/transcribe",
        {
          method: "POST",
          headers: transcribeHeaders,
          body: formData,
        }
      );

      if (!transcriptResponse.ok) {
        throw new Error("Transcription failed");
      }

      const transcriptData = await transcriptResponse.json();

      // Step 2: Extract expense
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const extractResponse = await fetch(
        "http://localhost:8000/api/extract-expense",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ transcript: transcriptData.transcript }),
        }
      );

      if (!extractResponse.ok) {
        // Try simple extraction fallback
        const simpleResponse = await fetch(
          "http://localhost:8000/api/extract-expense-simple",
          {
            method: "POST",
            headers,
            body: JSON.stringify({ transcript: transcriptData.transcript }),
          }
        );

        if (simpleResponse.ok) {
          const expenseData = await simpleResponse.json();
          handleExpenseData(expenseData);
        } else {
          throw new Error("Failed to extract expense");
        }
        return;
      }

      const expenseData = await extractResponse.json();
      handleExpenseData(expenseData);
    } catch (error) {
      console.error("Error processing audio:", error);
      setError(error.message || "Failed to process recording");
    } finally {
      setIsProcessing(false);
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
    if (onExpenseAdded) onExpenseAdded();
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setExtractedExpense(null);
    setError("");
    setPendingPantryExpense(null);
  };

  const handleConfirm = () => {
    if (showToast) {
      const count = extractedExpense?.count || 1;
      showToast(
        `${count} expense${count > 1 ? "s" : ""} added successfully!`,
        "success"
      );
    }
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

      if (e.code === "Space" && !isSpaceHeldRef.current && !isProcessing && !extractedExpense) {
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
  }, [startRecording, stopRecording, isRecording, isProcessing, extractedExpense]);

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
        </div>
      </div>

      {/* Pantry Modal */}
      {showPantryModal && pendingPantryExpense && (
        <AddToPantryModal
          expense={pendingPantryExpense}
          token={token}
          onClose={() => {
            setShowPantryModal(false);
            setPendingPantryExpense(null);
          }}
          onSuccess={() => {
            setShowPantryModal(false);
            setPendingPantryExpense(null);
            if (showToast) showToast("Items added to pantry!", "success");
            handleDismiss();
          }}
        />
      )}
    </>
  );
};

export default QuickRecordPopup;
