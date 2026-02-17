import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, Upload, X, Loader2, CheckCircle, AlertCircle, RotateCcw } from "lucide-react";
import { useScanReceipt } from "../hooks";
import { compressImage, isHeicFile, convertHeicToJpeg } from "../lib/imageCompression";
import "./ReceiptScanner.css";

// Detect if device is mobile (phones/tablets) vs desktop/laptop
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

/**
 * Validate that a file is an acceptable image type (including HEIC/HEIF).
 */
const isValidImageFile = (file) => {
  if (file.type.startsWith("image/")) return true;
  // Some browsers don't set a MIME type for HEIC — check extension
  const name = file.name?.toLowerCase() || "";
  return name.endsWith(".heic") || name.endsWith(".heif");
};

/**
 * Read a File into a data URL, converting HEIC first if needed.
 */
const readFileAsDataUrl = (file) => {
  return new Promise((resolve, reject) => {
    if (isHeicFile(file)) {
      convertHeicToJpeg(file).then(resolve).catch(reject);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    }
  });
};

const ReceiptScanner = ({ onClose, onSuccess }) => {
  const [mode, setMode] = useState("select"); // select, camera, preview, processing, result
  const [imageData, setImageData] = useState(null);
  const [ocrStatus, setOcrStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  // Mobile devices (iPhone, etc.) default to back camera; laptops default to front camera
  const [cameraFacing, setCameraFacing] = useState(() =>
    isMobileDevice() ? "environment" : "user"
  );

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

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

  const captureImage = async () => {
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

    // Compress the captured image
    try {
      const compressed = await compressImage(imageDataUrl);
      setImageData(compressed);
    } catch {
      setImageData(imageDataUrl);
    }

    // Stop camera
    stopCamera();
    setMode("preview");
  };

  /**
   * Process a File object — shared by both file input and drag & drop.
   */
  const processFile = async (file) => {
    if (!file) return;

    if (!isValidImageFile(file)) {
      setError("Please select an image file (JPG, PNG, HEIC, etc.)");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("Image too large. Please select an image under 20MB.");
      return;
    }

    setError("");

    try {
      const isHeic = isHeicFile(file);
      if (isHeic) {
        setOcrStatus("Converting HEIC image...");
        setMode("processing");
      }

      const rawDataUrl = await readFileAsDataUrl(file);

      try {
        const compressed = await compressImage(rawDataUrl);
        setImageData(compressed);
      } catch {
        setImageData(rawDataUrl);
      }
      setOcrStatus("");
      setMode("preview");
    } catch (err) {
      console.error("File processing error:", err);
      setError("Failed to read file. The format may not be supported.");
      setMode("select");
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files?.[0];
    processFile(file);
  };

  // --- Drag & Drop handlers ---
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.items?.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processImage = async () => {
    if (!imageData) return;

    setMode("processing");
    setOcrStatus("Analyzing receipt...");
    setError("");

    try {
      // Send image directly to backend for vision-based parsing
      const expenseResult = await scanReceiptMutation.mutateAsync(imageData);

      setResult(expenseResult);
      setMode("result");

      if (onSuccess) {
        onSuccess(expenseResult);
      }
    } catch (err) {
      console.error("Receipt processing error:", err);
      setError(err.message || "Failed to process receipt");
      setMode("preview");
    }
  };

  const resetScanner = () => {
    setImageData(null);
    setOcrStatus("");
    setError("");
    setResult(null);
    setIsDragging(false);
    dragCounterRef.current = 0;
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
          <div
            className={`receipt-scanner-content${isDragging ? " drag-active" : ""}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="drop-zone-overlay">
              <Upload size={48} />
              <p>Drop your receipt here</p>
            </div>
            <div>
              <p className="scanner-description">
                Take a photo, upload, or drag & drop a receipt image to automatically extract expense data.
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
                  accept="image/*,.heic,.heif"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
              </div>

              <p className="scanner-tips">
                Tip: You can drag & drop a receipt image directly onto this window. Supports JPG, PNG, HEIC, and more.
              </p>
            </div>
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
