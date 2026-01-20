import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Upload, X, Loader2, CheckCircle, AlertCircle, RotateCcw } from "lucide-react";
import Tesseract from "tesseract.js";
import { useScanReceipt } from "../hooks";
import "./ReceiptScanner.css";

const ReceiptScanner = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState("select"); // select, camera, preview, processing, result
  const [imageData, setImageData] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [cameraFacing, setCameraFacing] = useState("environment"); // environment = back camera

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  const scanReceiptMutation = useScanReceipt();

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      setError("");
      const constraints = {
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setMode("camera");
    } catch (err) {
      console.error("Camera error:", err);
      if (err.name === "NotAllowedError") {
        setError("Camera access denied. Please allow camera access and try again.");
      } else if (err.name === "NotFoundError") {
        setError("No camera found. Please use file upload instead.");
      } else {
        setError(`Camera error: ${err.message}`);
      }
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);

    // Get image data URL
    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setImageData(imageDataUrl);

    // Stop camera
    stopCamera();
    setMode("preview");
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image too large. Please select an image under 10MB.");
      return;
    }

    setError("");

    const reader = new FileReader();
    reader.onload = (e) => {
      setImageData(e.target.result);
      setMode("preview");
    };
    reader.onerror = () => {
      setError("Failed to read file");
    };
    reader.readAsDataURL(file);
  };

  const processImage = async () => {
    if (!imageData) return;

    setMode("processing");
    setOcrProgress(0);
    setOcrStatus("Initializing OCR...");
    setError("");

    try {
      // Run OCR with Tesseract.js
      const result = await Tesseract.recognize(imageData, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrProgress(Math.round(m.progress * 100));
            setOcrStatus("Reading receipt...");
          } else if (m.status === "loading language traineddata") {
            setOcrStatus("Loading language data...");
          } else if (m.status === "initializing api") {
            setOcrStatus("Initializing...");
          }
        },
      });

      const ocrText = result.data.text;

      if (!ocrText || ocrText.trim().length < 10) {
        throw new Error("Could not read text from the image. Please try a clearer photo.");
      }

      setOcrStatus("Parsing receipt data...");

      // Send OCR text to backend for parsing
      const expenseResult = await scanReceiptMutation.mutateAsync(ocrText);

      setResult(expenseResult);
      setMode("result");

      if (onSuccess) {
        onSuccess(expenseResult);
      }
    } catch (err) {
      console.error("Receipt processing error:", err);
      setError(err.message || "Failed to process receipt");
      setMode("preview"); // Go back to preview to allow retry
    }
  };

  const resetScanner = () => {
    setImageData(null);
    setOcrProgress(0);
    setOcrStatus("");
    setError("");
    setResult(null);
    setMode("select");
  };

  const handleClose = () => {
    stopCamera();
    if (onClose) onClose();
  };

  const switchCamera = async () => {
    stopCamera();
    setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"));
    // Camera will restart with new facing mode
    setTimeout(() => startCamera(), 100);
  };

  return (
    <div className="receipt-scanner-overlay">
      <div className="receipt-scanner-modal">
        <div className="receipt-scanner-header">
          <h2>Scan Receipt</h2>
          <button className="close-button" onClick={handleClose}>
            <X size={24} />
          </button>
        </div>

        {error && (
          <div className="receipt-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {mode === "select" && (
          <div className="receipt-scanner-content">
            <p className="scanner-description">
              Take a photo of your receipt or upload an image to automatically extract expense data.
            </p>

            <div className="scanner-options">
              <button className="scanner-option-button" onClick={startCamera}>
                <Camera size={32} />
                <span>Take Photo</span>
              </button>

              <button
                className="scanner-option-button"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={32} />
                <span>Upload Image</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </div>

            <p className="scanner-tips">
              Tips: Use good lighting, avoid glare, and ensure the receipt is flat and fully visible.
            </p>
          </div>
        )}

        {mode === "camera" && (
          <div className="receipt-scanner-content camera-mode">
            <div className="camera-container">
              <video ref={videoRef} autoPlay playsInline muted />
              <canvas ref={canvasRef} style={{ display: "none" }} />

              <div className="camera-overlay">
                <div className="receipt-frame" />
              </div>
            </div>

            <div className="camera-controls">
              <button className="camera-control-button" onClick={switchCamera}>
                <RotateCcw size={20} />
                <span>Flip</span>
              </button>

              <button className="capture-button" onClick={captureImage}>
                <div className="capture-button-inner" />
              </button>

              <button
                className="camera-control-button"
                onClick={() => {
                  stopCamera();
                  setMode("select");
                }}
              >
                <X size={20} />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        )}

        {mode === "preview" && imageData && (
          <div className="receipt-scanner-content preview-mode">
            <div className="preview-container">
              <img src={imageData} alt="Receipt preview" />
            </div>

            <div className="preview-actions">
              <button className="preview-button secondary" onClick={resetScanner}>
                <RotateCcw size={18} />
                <span>Retake</span>
              </button>

              <button
                className="preview-button primary"
                onClick={processImage}
                disabled={scanReceiptMutation.isPending}
              >
                <CheckCircle size={18} />
                <span>Process Receipt</span>
              </button>
            </div>
          </div>
        )}

        {mode === "processing" && (
          <div className="receipt-scanner-content processing-mode">
            <div className="processing-indicator">
              <Loader2 className="spinner" size={48} />
              <p className="processing-status">{ocrStatus}</p>
              {ocrProgress > 0 && (
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
              )}
              <p className="progress-text">{ocrProgress}%</p>
            </div>
          </div>
        )}

        {mode === "result" && result && (
          <div className="receipt-scanner-content result-mode">
            <div className="result-success">
              <CheckCircle size={48} />
              <h3>Expense Saved!</h3>
            </div>

            <div className="result-details">
              <div className="result-item">
                <span className="result-label">Store</span>
                <span className="result-value">{result.store}</span>
              </div>
              <div className="result-item">
                <span className="result-label">Items</span>
                <span className="result-value">{result.items}</span>
              </div>
              <div className="result-item">
                <span className="result-label">Amount</span>
                <span className="result-value">${result.amount.toFixed(2)}</span>
              </div>
              <div className="result-item">
                <span className="result-label">Category</span>
                <span className="result-value">{result.category}</span>
              </div>
              <div className="result-item">
                <span className="result-label">Date</span>
                <span className="result-value">{result.date}</span>
              </div>
            </div>

            <div className="result-actions">
              <button className="result-button secondary" onClick={resetScanner}>
                <Camera size={18} />
                <span>Scan Another</span>
              </button>

              <button className="result-button primary" onClick={handleClose}>
                <CheckCircle size={18} />
                <span>Done</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptScanner;
