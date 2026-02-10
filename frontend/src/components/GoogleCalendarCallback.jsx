import { useEffect, useState, useRef } from 'react';
import { useGoogleCalendarCallback } from '../hooks';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import './GoogleCalendarCallback.css';

const GoogleCalendarCallback = ({ onComplete, showToast }) => {
  const [status, setStatus] = useState('processing'); // processing, success, error
  const [errorMessage, setErrorMessage] = useState('');
  const callbackMutation = useGoogleCalendarCallback();
  const processedRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent double processing
      if (processedRef.current) return;
      processedRef.current = true;

      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');

      if (error) {
        setStatus('error');
        setErrorMessage(error === 'access_denied'
          ? 'Access was denied. Please try again and grant calendar access.'
          : `Google returned an error: ${error}`
        );
        return;
      }

      if (!code || !state) {
        setStatus('error');
        setErrorMessage('Missing authorization code or state. Please try connecting again.');
        return;
      }

      try {
        const result = await callbackMutation.mutateAsync({ code, state });
        setStatus('success');
        showToast?.(`Connected to Google Calendar${result.google_email ? ` (${result.google_email})` : ''}`, 'success');

        // Redirect to calendar after short delay
        setTimeout(() => {
          onComplete?.();
        }, 2000);
      } catch (error) {
        setStatus('error');
        setErrorMessage(error.message || 'Failed to connect Google Calendar');
        showToast?.(error.message || 'Failed to connect Google Calendar', 'error');
      }
    };

    handleCallback();
  }, []);

  const handleRetry = () => {
    onComplete?.();
  };

  return (
    <div className="google-callback-container">
      <div className="google-callback-card">
        {status === 'processing' && (
          <>
            <Loader2 className="google-callback-icon spinning" size={48} />
            <h2>Connecting Google Calendar</h2>
            <p>Please wait while we complete the connection...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="google-callback-icon success" size={48} />
            <h2>Successfully Connected!</h2>
            <p>Your Google Calendar has been connected. Redirecting to calendar...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="google-callback-icon error" size={48} />
            <h2>Connection Failed</h2>
            <p className="error-message">{errorMessage}</p>
            <button className="google-callback-retry-btn" onClick={handleRetry}>
              Return to Calendar
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default GoogleCalendarCallback;
