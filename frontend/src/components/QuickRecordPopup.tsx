/**
 * QuickRecordPopup.tsx - Global voice recording overlay for Voxal.
 *
 * Activated by holding the spacebar (push-to-talk) or via the VoxyFAB button.
 * When opened via FAB, shows an idle state with three options: voice, type, scan.
 * Records audio via the MediaRecorder API, sends it to the backend for
 * transcription, then routes the transcript through the chat/intent endpoint.
 * Expense inputs are parsed and displayed; grocery expenses prompt the user
 * to add items to the pantry. Non-expense intents render inline chat responses.
 */
import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Loader2, Check, X, Package, AlertCircle, MessageCircle, Keyboard, Camera, Send } from "lucide-react";
import AddToPantryModal from "./AddToPantryModal";
import ReceiptScanner from "./ReceiptScanner";
import { useAuth } from "../context/AuthContext";
import { useCreateExpense, useCreateExpenseSimple, useChat } from "../hooks";
import { API_BASE_URL } from "../config/api";
import type { ShowToast, Expense, ChatResponse, ReceiptScanResult } from "../types";
import "./QuickRecordPopup.css";

interface ExtractedExpenseData {
  expenses: Expense[];
  count: number;
  message?: string;
}

export interface QuickRecordPopupHandle {
  triggerOpen: () => void;
}

interface Props {
  showToast: ShowToast;
}

const QuickRecordPopup = forwardRef<QuickRecordPopupHandle, Props>(({ showToast }, ref) => {
  const { getToken } = useAuth();
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [extractedExpense, setExtractedExpense] = useState<ExtractedExpenseData | null>(null);
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [showPantryModal, setShowPantryModal] = useState<boolean>(false);
  const [pendingPantryExpense, setPendingPantryExpense] = useState<Expense | null>(null);

  // New states for idle mode
  const [showManualInput, setShowManualInput] = useState<boolean>(false);
  const [showReceiptScanner, setShowReceiptScanner] = useState<boolean>(false);
  const [manualInput, setManualInput] = useState<string>("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSpaceHeldRef = useRef<boolean>(false);
  const cancelledRef = useRef<boolean>(false);
  const startedViaButtonRef = useRef<boolean>(false);
  const manualInputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastStopTimeRef = useRef<number>(0);

  // React Query mutations
  const createExpenseMutation = useCreateExpense();
  const createExpenseSimpleMutation = useCreateExpenseSimple();
  const chatMutation = useChat();

  const isProcessing = createExpenseMutation.isPending || createExpenseSimpleMutation.isPending || chatMutation.isPending || isTranscribing;

  // Expose triggerOpen to parent via ref
  useImperativeHandle(ref, () => ({
    triggerOpen() {
      setIsVisible(true);
      setError("");
      setExtractedExpense(null);
      setChatResponse(null);
      setPendingPantryExpense(null);
      setShowManualInput(false);
      setShowReceiptScanner(false);
      setManualInput("");
    },
  }));

  // Increment a visible recording timer every second while recording
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

  // Auto-focus textarea when manual input opens
  useEffect(() => {
    if (showManualInput && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [showManualInput]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const checkForPantryItems = (expenseData: ExtractedExpenseData | Expense): void => {
    let expenses: Expense[] = [];
    if ((expenseData as ExtractedExpenseData).expenses) {
      expenses = (expenseData as ExtractedExpenseData).expenses;
    } else if ((expenseData as Expense).id) {
      expenses = [expenseData as Expense];
    }

    const groceryExpense = expenses.find((exp) => {
      const category = (exp.category || "").toLowerCase();
      return category.includes("groceries") || category.includes("grocery");
    });

    if (groceryExpense) {
      setPendingPantryExpense(groceryExpense);
    }
  };

  const RECORDING_COOLDOWN_MS = 1500;

  const startRecording = useCallback(async (): Promise<void> => {
    if (isRecording || isProcessing) return;
    if (Date.now() - lastStopTimeRef.current < RECORDING_COOLDOWN_MS) return;

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

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        // If dismissed/cancelled, skip processing entirely
        if (cancelledRef.current) {
          cancelledRef.current = false;
          return;
        }
        const blobType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        await processAudio(audioBlob, blobType);
      };

      cancelledRef.current = false;
      mediaRecorder.start();
      setIsRecording(true);
      setIsVisible(true);
      setShowManualInput(false);
      setShowReceiptScanner(false);
      setError("");
      setExtractedExpense(null);
      setPendingPantryExpense(null);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setError("Microphone access denied");
      setIsVisible(true);
    }
  }, [isRecording, isProcessing]);

  const stopRecording = useCallback((): void => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      lastStopTimeRef.current = Date.now();
    }
  }, [isRecording]);

  const processAudio = async (audioBlob: Blob, mimeType: string = "audio/webm"): Promise<void> => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    // Cancel any in-flight request before starting a new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsTranscribing(true);
    setChatResponse(null);

    try {
      const token = await getToken();

      const formData = new FormData();
      let extension = "webm";
      if (mimeType.includes("mp4")) extension = "mp4";
      else if (mimeType.includes("ogg")) extension = "ogg";

      formData.append("audio", audioBlob, `recording.${extension}`);

      const transcribeHeaders: Record<string, string> = {};
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
          signal: abortController.signal,
        }
      );

      if (!transcriptResponse.ok) {
        throw new Error("Transcription failed");
      }

      const transcriptData = await transcriptResponse.json();
      setIsTranscribing(false);

      await processText(transcriptData.transcript);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      const err = error as Error;
      console.error("Error processing audio:", err);
      setError(friendlyError(err.message));
    } finally {
      setIsTranscribing(false);
      isProcessingRef.current = false;
    }
  };

  // Turn raw/JSON error messages into something readable
  const friendlyError = (msg: string): string => {
    if (!msg) return "Something went wrong. Please try again.";
    const lower = msg.toLowerCase();
    if (lower.includes("empty message") || lower.includes("empty")) {
      return "I didn't catch anything. Try speaking a bit longer or type your message instead.";
    }
    if (lower.includes("transcription failed")) {
      return "Couldn't understand the audio. Try again in a quieter spot or type your message.";
    }
    if (lower.includes("microphone")) {
      return "Microphone access denied. Check your browser permissions and try again.";
    }
    // Strip JSON-looking strings
    if (msg.startsWith("{") || msg.startsWith("[")) {
      return "Something went wrong. Please try again.";
    }
    return msg;
  };

  // Shared text processing — used by both voice transcripts and manual input
  const processText = async (text: string): Promise<void> => {
    try {
      const chatResult = await chatMutation.mutateAsync(text);

      if (chatResult.intent === "expense_input" && (chatResult.data as Record<string, unknown>)?.route_to_expense) {
        try {
          const expenseData = await createExpenseMutation.mutateAsync(text);
          handleExpenseData(expenseData as unknown as ExtractedExpenseData);
        } catch {
          const expenseData = await createExpenseSimpleMutation.mutateAsync(text);
          handleExpenseData(expenseData as unknown as ExtractedExpenseData);
        }
      } else {
        setChatResponse(chatResult);
      }
    } catch (error) {
      const err = error as Error;
      console.error("Error processing text:", err);
      setError(friendlyError(err.message));
    }
  };

  const handleExpenseData = (expenseData: ExtractedExpenseData): void => {
    let expenses: Expense[];
    if (expenseData.expenses) {
      expenses = expenseData.expenses;
      setExtractedExpense(expenseData);
    } else {
      expenses = [expenseData as unknown as Expense];
      setExtractedExpense({
        expenses,
        count: 1,
        message: expenseData.message,
      });
    }
    checkForPantryItems(expenseData);

    const totalAmount = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const amountStr = totalAmount ? `$${totalAmount.toFixed(2)} logged` : "Expense logged";
    showToast(amountStr, "celebration", 4000);
  };

  const handleDismiss = (): void => {
    // Cancel any in-flight transcription/processing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isProcessingRef.current = false;
    // Stop any active recording and skip processing
    cancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
    // Force-release the microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsVisible(false);
    setExtractedExpense(null);
    setChatResponse(null);
    setError("");
    setPendingPantryExpense(null);
    setShowManualInput(false);
    setShowReceiptScanner(false);
    setManualInput("");
  };

  const handleConfirm = (): void => {
    handleDismiss();
  };

  // Manual input submission
  const handleManualSubmit = async (): Promise<void> => {
    const text = manualInput.trim();
    if (!text || isProcessing || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setShowManualInput(false);
    setManualInput("");
    setIsTranscribing(true);
    setChatResponse(null);
    try {
      await processText(text);
    } finally {
      setIsTranscribing(false);
      isProcessingRef.current = false;
    }
  };

  // Receipt scanner success handler
  const handleReceiptSuccess = async (result: ReceiptScanResult): Promise<void> => {
    setShowReceiptScanner(false);
    const text = `I spent $${result.amount} at ${result.store} on ${result.items}${result.date ? ` on ${result.date}` : ""}`;
    setIsTranscribing(true);
    setChatResponse(null);
    try {
      await processText(text);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Global spacebar push-to-talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (
        (e.target as HTMLElement).tagName === "INPUT" ||
        (e.target as HTMLElement).tagName === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.code === "Space" && !isSpaceHeldRef.current && !isProcessing && !extractedExpense && !chatResponse) {
        e.preventDefault();
        isSpaceHeldRef.current = true;
        startedViaButtonRef.current = false;
        startRecording();
      }
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
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

  // Determine whether to show the idle state (popup visible, nothing else active)
  const isIdle = isVisible && !isRecording && !isProcessing && !error && !extractedExpense && !chatResponse && !showManualInput && !showReceiptScanner;

  if (!isVisible) return null;

  // Receipt scanner has its own modal — render only that, no overlay
  if (showReceiptScanner && !isRecording && !isProcessing && !extractedExpense && !chatResponse) {
    return (
      <ReceiptScanner
        onClose={() => { setShowReceiptScanner(false); handleDismiss(); }}
        onSuccess={handleReceiptSuccess}
      />
    );
  }

  // Idle state renders as a small dropdown below the FAB — no overlay
  if (isIdle) {
    return (
      <>
        <motion.div
          className="idle-backdrop"
          onClick={handleDismiss}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
        <motion.div
          className="quick-record-dropdown"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <button className="idle-dropdown-btn" onClick={() => { startedViaButtonRef.current = true; startRecording(); }}>
            <div className="idle-dropdown-icon idle-dropdown-icon--mic">
              <Mic size={18} />
            </div>
            <span>Voice</span>
          </button>
          <button className="idle-dropdown-btn" onClick={() => setShowManualInput(true)}>
            <div className="idle-dropdown-icon idle-dropdown-icon--type">
              <Keyboard size={18} />
            </div>
            <span>Type</span>
          </button>
          <button className="idle-dropdown-btn" onClick={() => setShowReceiptScanner(true)}>
            <div className="idle-dropdown-icon idle-dropdown-icon--scan">
              <Camera size={18} />
            </div>
            <span>Scan</span>
          </button>
        </motion.div>
      </>
    );
  }

  return (
    <>
      {!showPantryModal && (
      <motion.div
        className="quick-record-overlay"
        onClick={handleDismiss}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className="quick-record-popup"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
        >
          {/* Manual Input State */}
          {showManualInput && !isProcessing && !extractedExpense && !chatResponse && (
            <div className="quick-record-manual">
              <h3>Type your message</h3>
              <textarea
                ref={manualInputRef}
                className="quick-record-textarea"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="e.g. 'I spent $20 at Walmart', 'How many eggs do I have?', 'What can I cook?'"
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleManualSubmit();
                  }
                }}
              />
              <div className="quick-record-actions">
                <button
                  className="confirm-btn"
                  onClick={handleManualSubmit}
                  disabled={!manualInput.trim()}
                >
                  <Send size={18} />
                  <span>Send</span>
                </button>
                <button className="dismiss-btn" onClick={() => setShowManualInput(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Recording State */}
          {isRecording && (
            <div className="quick-record-recording">
              <div
                className={`recording-pulse${startedViaButtonRef.current ? " clickable" : ""}`}
                onClick={startedViaButtonRef.current ? stopRecording : undefined}
              >
                <Mic size={32} />
              </div>
              <div className="recording-time">{formatTime(recordingTime)}</div>
              <p className="recording-hint">
                {startedViaButtonRef.current ? "Tap the mic to stop" : "Release spacebar to stop"}
              </p>
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

          {/* Result State -- extracted expense details */}
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
        </motion.div>
      </motion.div>
      )}

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
});

QuickRecordPopup.displayName = "QuickRecordPopup";

export default QuickRecordPopup;
