import { useState, useRef, useEffect } from "react";
import { Mic, Square, Loader2, Type, Package } from "lucide-react";
import AddToPantryModal from "./AddToPantryModal";
import { useAuth } from "../context/AuthContext";
import { useCreateExpense, useCreateExpenseSimple } from "../hooks";
import { API_BASE_URL } from "../config/api";
import "./VoiceRecorder.css";

const VoiceRecorder = ({ showToast }) => {
  const { getToken } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extractedExpense, setExtractedExpense] = useState(null);
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [error, setError] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const [showPantryModal, setShowPantryModal] = useState(false);
  const [pendingPantryExpense, setPendingPantryExpense] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);

  // React Query mutations
  const createExpenseMutation = useCreateExpense();
  const createExpenseSimpleMutation = useCreateExpenseSimple();

  // Combined loading state
  const loading = createExpenseMutation.isPending || createExpenseSimpleMutation.isPending || isTranscribing;

  // Recording timer effect
  useEffect(() => {
    if (isRecording) {
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  // Format seconds to MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Check if expense is a grocery expense and enable pantry button
  const checkForPantryItems = (expenseData) => {
    // Handle both single expense and array of expenses
    let expenses = [];
    if (expenseData.expenses) {
      expenses = expenseData.expenses;
    } else if (expenseData.id) {
      expenses = [expenseData];
    }

    // Find the first grocery expense to add to pantry
    const groceryExpense = expenses.find(exp => {
      const category = (exp.category || "").toLowerCase();
      return category.includes("groceries") || category.includes("grocery");
    });

    if (groceryExpense) {
      setPendingPantryExpense(groceryExpense);
    }
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("MediaRecorder is not available in this browser");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      streamRef.current = stream;

      // Try to find a supported audio format
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/ogg";
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blobType = mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, {
          type: blobType,
        });
        await processAudio(audioBlob, blobType);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTranscript(""); // Clear any previous transcript
      setError(""); // Clear any previous errors
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setError("Error accessing microphone. Please check permissions.");
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processTranscript = async (transcriptText) => {
    setError("");
    setExtractedExpense(null);

    try {
      console.log("Processing transcript:", transcriptText);
      const expenseData = await createExpenseMutation.mutateAsync(transcriptText);
      console.log("Expense data received:", expenseData);

      // Handle both old format (single expense) and new format (array of expenses)
      if (expenseData.expenses) {
        setExtractedExpense(expenseData);
        checkForPantryItems(expenseData);
      } else {
        setExtractedExpense({
          expenses: [expenseData],
          count: 1,
          message: expenseData.message
        });
        checkForPantryItems(expenseData);
      }
    } catch (error) {
      console.error("Error processing transcript:", error);
      if (error.message?.includes("429") || error.message?.includes("quota")) {
        setError("API quota exceeded. Using simple extraction instead.");
        await processExpenseSimple(transcriptText);
      } else if (error.message === "Failed to fetch") {
        setError(
          "Cannot connect to backend server. Make sure the backend is running."
        );
      } else {
        setError(`Error: ${error.message}`);
        // Try simple extraction as fallback
        try {
          await processExpenseSimple(transcriptText);
        } catch (simpleError) {
          console.error("Simple extraction also failed:", simpleError);
          setError(
            `Both extraction methods failed. Backend may be down. Error: ${error.message}`
          );
        }
      }
    }
  };

  const processExpenseSimple = async (transcriptText) => {
    try {
      const expenseData = await createExpenseSimpleMutation.mutateAsync(transcriptText);

      // Handle both old format (single expense) and new format (array of expenses)
      if (expenseData.expenses) {
        setExtractedExpense(expenseData);
        checkForPantryItems(expenseData);
      } else {
        setExtractedExpense({
          expenses: [expenseData],
          count: 1,
          message: expenseData.message
        });
        checkForPantryItems(expenseData);
      }
    } catch (error) {
      console.error("Error with simple extraction:", error);
      setError(
        "Could not extract expense information. Please try the manual input."
      );
    }
  };

  const processAudio = async (audioBlob, mimeType = "audio/webm") => {
    setIsTranscribing(true);
    setTranscript("");
    setExtractedExpense(null);

    try {
      const token = getToken();

      // Step 1: Transcribe audio using Deepgram API (via backend)
      const formData = new FormData();
      // Determine file extension based on mime type
      let extension = "webm";
      if (mimeType.includes("mp4")) extension = "mp4";
      else if (mimeType.includes("ogg")) extension = "ogg";
      else if (mimeType.includes("webm")) extension = "webm";

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
          body: formData,
        }
      );

      if (!transcriptResponse.ok) {
        const errorText = await transcriptResponse.text();
        throw new Error(
          `Deepgram transcription failed: ${transcriptResponse.status} - ${errorText}`
        );
      }

      const transcriptData = await transcriptResponse.json();
      setTranscript(transcriptData.transcript);
      setIsTranscribing(false);

      // Step 2: Extract expense information using mutation
      const expenseData = await createExpenseMutation.mutateAsync(transcriptData.transcript);
      setExtractedExpense(expenseData);
      checkForPantryItems(expenseData);
    } catch (error) {
      console.error("Error processing audio:", error);
      const errorMessage = error.message || "Unknown error occurred";

      // Check if it's a quota error
      if (errorMessage.includes("quota") || errorMessage.includes("429")) {
        setError(
          "Deepgram API quota exceeded. Please try again later or use manual text input."
        );
      } else {
        setError(`Error: ${errorMessage}`);
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualInput.trim()) {
      setError("Please enter a description of your purchase");
      return;
    }

    setError("");
    setTranscript("");
    setExtractedExpense(null);

    try {
      const expenseData = await createExpenseMutation.mutateAsync(manualInput);
      setExtractedExpense(expenseData);
      checkForPantryItems(expenseData);
      setManualInput("");
      setShowManualInput(false);
    } catch (error) {
      console.error("Error processing manual input:", error);
      if (error.message?.includes("429") || error.message?.includes("quota")) {
        setError(
          "OpenAI API quota exceeded. Please add payment method or wait for quota reset."
        );
      } else {
        setError(`Error: ${error.message}`);
      }
    }
  };

  return (
    <div className="voice-recorder">
      <h2>Record Your Expense</h2>
      <p className="recorder-description">
        Click the microphone button and describe your purchase. For example: "I
        bought groceries at Walmart for $45.50 - milk, bread, and eggs"
      </p>

      <div className="recorder-controls">
        {!isRecording ? (
          <button
            className="record-button"
            onClick={startRecording}
            disabled={loading}>
            <Mic size={32} />
            <span>Start Recording</span>
          </button>
        ) : (
          <button className="stop-button" onClick={stopRecording}>
            <Square size={32} />
            <span>Stop Recording</span>
          </button>
        )}
        <button
          className="manual-button"
          onClick={() => setShowManualInput(!showManualInput)}
          disabled={loading}>
          <Type size={20} />
          <span>{showManualInput ? "Hide" : "Type"} Manual Entry</span>
        </button>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
            Check the browser console (F12) and backend terminal for more
            details.
          </p>
        </div>
      )}

      {showManualInput && (
        <div className="manual-input-section">
          <h3>Type Your Expense</h3>
          <textarea
            className="manual-textarea"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Example: I bought groceries at Walmart for $45.50 - milk, bread, and eggs"
            rows={4}
            disabled={loading}
          />
          <button
            className="submit-manual-button"
            onClick={handleManualSubmit}
            disabled={loading || !manualInput.trim()}>
            {loading ? "Processing..." : "Submit Expense"}
          </button>
        </div>
      )}

      {loading && (
        <div className="processing-indicator">
          <Loader2 className="spinner" size={24} />
          <p>Processing your voice...</p>
        </div>
      )}

      {isRecording && (
        <div className="recording-indicator">
          <div className="recording-timer">{formatTime(recordingTime)}</div>
          <div className="recording-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p className="recording-text">Recording... Speak now</p>
        </div>
      )}

      {transcript && !isRecording && (
        <div className="transcript-section">
          <h3>Transcript:</h3>
          <p className="transcript-text">{transcript}</p>
        </div>
      )}

      {extractedExpense && extractedExpense.expenses && (
        <div className="expense-result">
          <h3>{extractedExpense.count > 1 ? `${extractedExpense.count} Expenses Saved` : 'Expense Saved'}</h3>
          {extractedExpense.expenses.map((expense, index) => (
            <div key={expense.id || index} className="expense-details" style={{marginBottom: extractedExpense.count > 1 ? '15px' : '0', paddingBottom: extractedExpense.count > 1 ? '15px' : '0', borderBottom: index < extractedExpense.count - 1 ? '1px solid #eee' : 'none'}}>
              {extractedExpense.count > 1 && <h4 style={{marginTop: '0', color: '#666'}}>Item {index + 1}</h4>}
              <p>
                <strong>Store:</strong> {expense.store}
              </p>
              <p>
                <strong>Items:</strong> {expense.items}
              </p>
              {expense.category && (
                <p>
                  <strong>Category:</strong>{" "}
                  {expense.category}
                </p>
              )}
              {expense.amount && (
                <p>
                  <strong>Amount:</strong> ${expense.amount.toFixed(2)}
                </p>
              )}
              <p>
                <strong>Date:</strong> {expense.date}
              </p>
            </div>
          ))}

          {/* Add to Pantry button for grocery expenses */}
          {pendingPantryExpense && !showPantryModal && (
            <button
              className="add-to-pantry-button"
              onClick={() => setShowPantryModal(true)}
            >
              <Package size={18} />
              <span>Add to Pantry</span>
            </button>
          )}
        </div>
      )}

      {/* Add to Pantry Modal for grocery expenses */}
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
          }}
        />
      )}
    </div>
  );
};

export default VoiceRecorder;
