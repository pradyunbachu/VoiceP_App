import { useState, useRef, useCallback, useEffect } from 'react';

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface UseWebSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  isSupported: boolean;
  error: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function useWebSpeechRecognition(): UseWebSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<InstanceType<typeof SpeechRecognition> | null>(null);
  const shouldBeListeningRef = useRef(false);

  const isSupported = !!SpeechRecognition;

  useEffect(() => {
    return () => {
      shouldBeListeningRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognition) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    shouldBeListeningRef.current = true;
    setError(null);

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results[event.results.length - 1];
      if (last.isFinal) {
        const text = last[0].transcript.trim();
        if (text) setTranscript(text);
      }
    };

    recognition.onend = () => {
      // Auto-restart if we should still be listening (browser stops after silence)
      if (shouldBeListeningRef.current) {
        try { recognition.start(); } catch { /* already started */ }
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = (event: { error: string }) => {
      // 'no-speech' and 'aborted' are expected — don't surface them
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setError(event.error);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      setError('Failed to start speech recognition');
    }
  }, []);

  const stopListening = useCallback(() => {
    shouldBeListeningRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    setIsListening(false);
  }, []);

  return { isListening, transcript, startListening, stopListening, isSupported, error };
}
