import { useState, useRef } from "react";
import { Mic, Square, Loader2, Type } from "lucide-react";
import { CATEGORIES } from "../constants/categories";
import "./VoiceRecorder.css";

const VoiceRecorder = ({ onExpenseAdded, loading, setLoading, token, showToast }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extractedExpense, setExtractedExpense] = useState(null);
  const [editingExpenseIndex, setEditingExpenseIndex] = useState(null);
  const [editedExpenses, setEditedExpenses] = useState([]);
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

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
      // Extract expense information directly (skip transcription step)
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
          body: JSON.stringify({ transcript: transcriptText }),
        }
      );

      console.log("Extract response status:", extractResponse.status);

      if (!extractResponse.ok) {
        const errorText = await extractResponse.text();
        console.error("Extract error:", errorText);
        if (extractResponse.status === 429) {
          const quotaMsg = "API quota exceeded. Using simple extraction instead.";
          setError(quotaMsg);
          if (showToast) {
            showToast(quotaMsg, "warning");
          }
          // Fallback to simple extraction
          await processExpenseSimple(transcriptText);
        } else {
          const errorMsg = `Failed to extract expense: ${errorText}`;
          setError(errorMsg);
          if (showToast) {
            showToast(errorMsg, "error");
          }
          // Try simple extraction as fallback
          await processExpenseSimple(transcriptText);
        }
        return;
      }

      const expenseData = await extractResponse.json();
      console.log("Expense data received:", expenseData);
      // Handle both old format (single expense) and new format (array of expenses)
      if (expenseData.expenses) {
        // New format with expenses array
        setExtractedExpense(expenseData);
      } else {
        // Old format (single expense) - convert to new format for compatibility
        setExtractedExpense({
          expenses: [expenseData],
          count: 1,
          message: expenseData.message
        });
      }
      onExpenseAdded();
    } catch (error) {
      console.error("Error processing transcript:", error);
      let errorMsg = "";
      if (error.message === "Failed to fetch") {
        errorMsg = "Cannot connect to backend server. Please make sure the backend is running.";
      } else {
        errorMsg = `Failed to process expense: ${error.message}`;
      }
      setError(errorMsg);
      if (showToast) {
        showToast(errorMsg, "error");
      }
      // Try simple extraction as fallback
      try {
        await processExpenseSimple(transcriptText);
      } catch (simpleError) {
        console.error("Simple extraction also failed:", simpleError);
        const fallbackMsg = "Both extraction methods failed. Please try manual input.";
        setError(fallbackMsg);
        if (showToast) {
          showToast(fallbackMsg, "error");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const processExpenseSimple = async (transcriptText) => {
    // Use simple regex-based extraction as fallback
    try {
      const headers = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(
        "http://localhost:8000/api/extract-expense-simple",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ transcript: transcriptText }),
        }
      );

      if (response.ok) {
        const expenseData = await response.json();
        // Handle both old format (single expense) and new format (array of expenses)
        let expensesArray = [];
        if (expenseData.expenses) {
          expensesArray = expenseData.expenses;
          setExtractedExpense(expenseData);
        } else {
          expensesArray = [expenseData];
          setExtractedExpense({
            expenses: [expenseData],
            count: 1,
            message: expenseData.message
          });
        }
        // Initialize edited expenses with the extracted ones
        setEditedExpenses(expensesArray.map(exp => ({ ...exp })));
        setEditingExpenseIndex(null);
      }
    } catch (error) {
      console.error("Error with simple extraction:", error);
      const errorMsg = "Could not extract expense information. Please try the manual input.";
      setError(errorMsg);
      if (showToast) {
        showToast(errorMsg, "error");
      }
    }
  };

  const processAudio = async (audioBlob, mimeType = "audio/webm") => {
    setLoading(true);
    setTranscript("");
    setExtractedExpense(null);

    try {
      // Step 1: Transcribe audio using Deepgram API (via backend)
      const formData = new FormData();
      // Determine file extension based on mime type
      let extension = "webm";
      if (mimeType.includes("mp4")) extension = "mp4";
      else if (mimeType.includes("ogg")) extension = "ogg";
      else if (mimeType.includes("webm")) extension = "webm";

      formData.append("audio", audioBlob, `recording.${extension}`);

      const transcriptResponse = await fetch(
        "http://localhost:8000/api/transcribe",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!transcriptResponse.ok) {
        const errorText = await transcriptResponse.text();
        const errorMsg = `Transcription failed: ${transcriptResponse.status === 503 ? "Deepgram API not configured. Please set DEEPGRAM_API_KEY." : errorText}`;
        if (showToast) {
          showToast(errorMsg, "error");
        }
        throw new Error(errorMsg);
      }

      const transcriptData = await transcriptResponse.json();
      setTranscript(transcriptData.transcript);

      // Step 2: Extract expense information
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
        const errorText = await extractResponse.text();
        throw new Error(
          `Expense extraction failed: ${extractResponse.status} - ${errorText}`
        );
      }

      const expenseData = await extractResponse.json();
      setExtractedExpense(expenseData);
      onExpenseAdded();
    } catch (error) {
      console.error("Error processing audio:", error);
      const errorMessage = error.message || "Unknown error occurred";
      const errorDetails = error.response
        ? `Status: ${error.response.status}, ${await error.response
            .text()
            .catch(() => "No details")}`
        : errorMessage;

      // Check if it's a quota error
      if (errorMessage.includes("quota") || errorMessage.includes("429")) {
        const quotaMsg = "Deepgram API quota exceeded. Please try again later or use manual text input.";
        setError(quotaMsg);
        if (showToast) {
          showToast(quotaMsg, "warning");
        }
      } else {
        const errorMsg = `Failed to process audio: ${errorDetails}`;
        setError(errorMsg);
        if (showToast) {
          showToast(errorMsg, "error");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualInput.trim()) {
      const errorMsg = "Please enter a description of your purchase";
      setError(errorMsg);
      if (showToast) {
        showToast(errorMsg, "warning");
      }
      return;
    }

    setLoading(true);
    setError("");
    setTranscript("");
    setExtractedExpense(null);

    try {
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
          body: JSON.stringify({ transcript: manualInput }),
        }
      );

      if (!extractResponse.ok) {
        const errorText = await extractResponse.text();
        let errorMsg = "";
        if (extractResponse.status === 429) {
          errorMsg = "API quota exceeded. Please try again later.";
        } else {
          errorMsg = `Failed to extract expense: ${errorText}`;
        }
        setError(errorMsg);
        if (showToast) {
          showToast(errorMsg, "error");
        }
        return;
      }

      const expenseData = await extractResponse.json();
      setExtractedExpense(expenseData);
      setManualInput("");
      setShowManualInput(false);
      onExpenseAdded();
    } catch (error) {
      console.error("Error processing manual input:", error);
      const errorMsg = `Failed to process expense: ${error.message}`;
      setError(errorMsg);
      if (showToast) {
        showToast(errorMsg, "error");
      }
    } finally {
      setLoading(false);
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
          <h3>Review and Edit Expenses</h3>
          <p style={{color: '#a0a0a0', marginBottom: '1rem'}}>Make sure the categories match your budgets before saving.</p>
          {editedExpenses.map((expense, index) => (
            <div key={expense.id || index} className="expense-details" style={{marginBottom: extractedExpense.count > 1 ? '15px' : '0', paddingBottom: extractedExpense.count > 1 ? '15px' : '0', borderBottom: index < extractedExpense.count - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'}}>
              {extractedExpense.count > 1 && <h4 style={{marginTop: '0', color: '#a0a0a0'}}>Expense {index + 1}</h4>}
              <div className="expense-field">
                <label><strong>Store:</strong></label>
                <input
                  type="text"
                  value={expense.store || ''}
                  onChange={(e) => {
                    const updated = [...editedExpenses];
                    updated[index].store = e.target.value;
                    setEditedExpenses(updated);
                  }}
                  className="expense-edit-input"
                />
              </div>
              <div className="expense-field">
                <label><strong>Items:</strong></label>
                <input
                  type="text"
                  value={expense.items || ''}
                  onChange={(e) => {
                    const updated = [...editedExpenses];
                    updated[index].items = e.target.value;
                    setEditedExpenses(updated);
                  }}
                  className="expense-edit-input"
                />
              </div>
              <div className="expense-field">
                <label><strong>Category:</strong></label>
                <select
                  value={expense.category || 'Other'}
                  onChange={(e) => {
                    const updated = [...editedExpenses];
                    updated[index].category = e.target.value;
                    setEditedExpenses(updated);
                  }}
                  className="expense-edit-select"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="expense-field">
                <label><strong>Amount:</strong></label>
                <input
                  type="number"
                  step="0.01"
                  value={expense.amount || ''}
                  onChange={(e) => {
                    const updated = [...editedExpenses];
                    updated[index].amount = parseFloat(e.target.value) || 0;
                    setEditedExpenses(updated);
                  }}
                  className="expense-edit-input"
                />
              </div>
              <div className="expense-field">
                <label><strong>Date:</strong></label>
                <input
                  type="date"
                  value={expense.date || ''}
                  onChange={(e) => {
                    const updated = [...editedExpenses];
                    updated[index].date = e.target.value;
                    setEditedExpenses(updated);
                  }}
                  className="expense-edit-input"
                />
              </div>
            </div>
          ))}
          <div className="expense-actions" style={{marginTop: '1.5rem', display: 'flex', gap: '1rem'}}>
            <button
              onClick={async () => {
                try {
                  setLoading(true);
                  const headers = {
                    "Content-Type": "application/json",
                  };
                  if (token) {
                    headers["Authorization"] = `Bearer ${token}`;
                  }

                  // Save each expense
                  for (const expense of editedExpenses) {
                    const response = await fetch("http://localhost:8000/api/expenses", {
                      method: "POST",
                      headers,
                      body: JSON.stringify(expense),
                    });

                    if (!response.ok) {
                      throw new Error("Failed to save expense");
                    }
                  }

                  setExtractedExpense(null);
                  setEditedExpenses([]);
                  onExpenseAdded();
                  if (showToast) {
                    showToast(`${editedExpenses.length} expense(s) saved successfully!`, "success");
                  }
                } catch (error) {
                  console.error("Error saving expenses:", error);
                  if (showToast) {
                    showToast("Failed to save expenses", "error");
                  }
                } finally {
                  setLoading(false);
                }
              }}
              className="save-expenses-button"
              disabled={loading}
            >
              Save {editedExpenses.length > 1 ? 'All Expenses' : 'Expense'}
            </button>
            <button
              onClick={() => {
                setExtractedExpense(null);
                setEditedExpenses([]);
              }}
              className="cancel-expenses-button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;
