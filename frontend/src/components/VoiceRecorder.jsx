import { useState, useRef } from "react";
import { Mic, Square, Loader2, Type } from "lucide-react";
import "./VoiceRecorder.css";

const VoiceRecorder = ({ onExpenseAdded, loading, setLoading }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [extractedExpense, setExtractedExpense] = useState(null);
  const [manualInput, setManualInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [error, setError] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const startRecording = async () => {
    try {
      // Check if Web Speech API is available (free, no API needed)
      if (
        "webkitSpeechRecognition" in window ||
        "SpeechRecognition" in window
      ) {
        // Use Web Speech API (free, browser-based)
        const SpeechRecognition =
          window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onresult = async (event) => {
          const transcriptText = event.results[0][0].transcript;
          console.log("Transcript received:", transcriptText);
          setTranscript(transcriptText);
          setLoading(true);
          await processTranscript(transcriptText);
        };

        recognition.onerror = (event) => {
          console.error("Speech recognition error:", event.error);
          setError(`Speech recognition error: ${event.error}`);
          setLoading(false);
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        mediaRecorderRef.current = recognition;
        recognition.start();
        setIsRecording(true);
      } else {
        // Fallback to MediaRecorder + backend transcription
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

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
          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      }
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Error accessing microphone. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Check if it's Web Speech API or MediaRecorder
      if (
        mediaRecorderRef.current.stop &&
        typeof mediaRecorderRef.current.stop === "function"
      ) {
        if (mediaRecorderRef.current.abort) {
          // Web Speech API
          mediaRecorderRef.current.stop();
        } else {
          // MediaRecorder
          mediaRecorderRef.current.stop();
        }
      }
      setIsRecording(false);
    }
  };

  const processTranscript = async (transcriptText) => {
    setError("");
    setExtractedExpense(null);

    try {
      console.log("Processing transcript:", transcriptText);
      // Extract expense information directly (skip transcription step)
      const extractResponse = await fetch(
        "http://localhost:8000/api/extract-expense",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transcript: transcriptText }),
        }
      );

      console.log("Extract response status:", extractResponse.status);

      if (!extractResponse.ok) {
        const errorText = await extractResponse.text();
        console.error("Extract error:", errorText);
        if (extractResponse.status === 429) {
          setError("API quota exceeded. Using simple extraction instead.");
          // Fallback to simple extraction
          await processExpenseSimple(transcriptText);
        } else {
          setError(`Error: ${errorText}`);
          // Try simple extraction as fallback
          await processExpenseSimple(transcriptText);
        }
        return;
      }

      const expenseData = await extractResponse.json();
      console.log("Expense data received:", expenseData);
      setExtractedExpense(expenseData);
      onExpenseAdded();
    } catch (error) {
      console.error("Error processing transcript:", error);
      if (error.message === "Failed to fetch") {
        setError(
          "Cannot connect to backend server. Make sure the backend is running on http://localhost:8000"
        );
      } else {
        setError(`Error: ${error.message}`);
      }
      // Try simple extraction as fallback
      try {
        await processExpenseSimple(transcriptText);
      } catch (simpleError) {
        console.error("Simple extraction also failed:", simpleError);
        setError(
          `Both extraction methods failed. Backend may be down. Error: ${error.message}`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const processExpenseSimple = async (transcriptText) => {
    // Use simple regex-based extraction as fallback
    try {
      const response = await fetch(
        "http://localhost:8000/api/extract-expense-simple",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transcript: transcriptText }),
        }
      );

      if (response.ok) {
        const expenseData = await response.json();
        setExtractedExpense(expenseData);
        onExpenseAdded();
      }
    } catch (error) {
      console.error("Error with simple extraction:", error);
      setError(
        "Could not extract expense information. Please try the manual input."
      );
    }
  };

  const processAudio = async (audioBlob, mimeType = "audio/webm") => {
    setLoading(true);
    setTranscript("");
    setExtractedExpense(null);

    try {
      // Step 1: Transcribe audio
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
        throw new Error(
          `Transcription failed: ${transcriptResponse.status} - ${errorText}`
        );
      }

      const transcriptData = await transcriptResponse.json();
      setTranscript(transcriptData.transcript);

      // Step 2: Extract expense information
      const extractResponse = await fetch(
        "http://localhost:8000/api/extract-expense",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
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
        setError(
          "OpenAI API quota exceeded. You can use the manual text input below instead."
        );
      } else {
        setError(`Error: ${errorDetails}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualInput.trim()) {
      setError("Please enter a description of your purchase");
      return;
    }

    setLoading(true);
    setError("");
    setTranscript("");
    setExtractedExpense(null);

    try {
      const extractResponse = await fetch(
        "http://localhost:8000/api/extract-expense",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ transcript: manualInput }),
        }
      );

      if (!extractResponse.ok) {
        const errorText = await extractResponse.text();
        if (extractResponse.status === 429) {
          setError(
            "OpenAI API quota exceeded. Please add payment method or wait for quota reset."
          );
        } else {
          setError(`Error: ${errorText}`);
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
      setError(`Error: ${error.message}`);
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

      {transcript && (
        <div className="transcript-section">
          <h3>Transcript:</h3>
          <p className="transcript-text">{transcript}</p>
        </div>
      )}

      {extractedExpense && (
        <div className="expense-result">
          <h3>✅ Expense Saved!</h3>
          <div className="expense-details">
            <p>
              <strong>Store:</strong> {extractedExpense.store}
            </p>
            <p>
              <strong>Items:</strong> {extractedExpense.items}
            </p>
            {extractedExpense.amount && (
              <p>
                <strong>Amount:</strong> ${extractedExpense.amount.toFixed(2)}
              </p>
            )}
            <p>
              <strong>Date:</strong> {extractedExpense.date}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;
