/**
 * useSpeechToText
 *
 * A thin wrapper around the browser's Web Speech API (SpeechRecognition /
 * webkitSpeechRecognition). Provides real mic → transcript with no external
 * dependencies.
 *
 * Usage:
 *   const { startListening, stopListening, isListening, transcript, error, supported } =
 *     useSpeechToText({ onResult, onEnd });
 *
 * Notes:
 *   - `onResult` fires whenever an interim or final transcript chunk arrives.
 *   - `onEnd` fires when the recognition session ends (silence, stop call, or error).
 *   - Set `continuous: false` (default) to capture a single utterance and auto-stop.
 *   - The hook cleans up the recogniser on unmount.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/* ── Type shim for browsers that only expose the prefixed version ───────── */
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface UseSpeechToTextOptions {
  /** Called with the latest transcript string after each recognition result. */
  onResult?: (transcript: string) => void;
  /**
   * Called when the recognition session ends. `transcript` is the final
   * accumulated text (may be empty if nothing was heard).
   */
  onEnd?: (transcript: string) => void;
  /** If true, keeps the mic open across multiple utterances. Default: false. */
  continuous?: boolean;
  /** BCP-47 language tag. Default: 'en-US'. */
  lang?: string;
}

interface UseSpeechToTextReturn {
  startListening: () => void;
  stopListening: () => void;
  isListening: boolean;
  transcript: string;
  error: string | null;
  /** False when the browser doesn't support SpeechRecognition at all. */
  supported: boolean;
}

export function useSpeechToText({
  onResult,
  onEnd,
  continuous = false,
  lang = "en-US",
}: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recogniserRef = useRef<SpeechRecognition | null>(null);
  const accumulatedRef = useRef("");

  const SpeechRecognitionCtor =
    typeof window !== "undefined"
      ? window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
      : null;

  const supported = SpeechRecognitionCtor !== null;

  // Keep callback refs stable so we don't re-create the recogniser on every render.
  const onResultRef = useRef(onResult);
  const onEndRef = useRef(onEnd);
  useEffect(() => { onResultRef.current = onResult; }, [onResult]);
  useEffect(() => { onEndRef.current = onEnd; }, [onEnd]);

  const stopListening = useCallback(() => {
    recogniserRef.current?.stop();
    // isListening is flipped in the `onend` handler.
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionCtor) {
      setError("SpeechRecognition is not supported in this browser.");
      return;
    }

    // Tear down any previous session.
    if (recogniserRef.current) {
      recogniserRef.current.abort();
    }

    setError(null);
    accumulatedRef.current = "";
    setTranscript("");

    const rec = new SpeechRecognitionCtor();
    rec.continuous = continuous;
    rec.interimResults = true;
    rec.lang = lang;
    recogniserRef.current = rec;

    rec.onstart = () => {
      setIsListening(true);
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) accumulatedRef.current += final;
      const current = (accumulatedRef.current + interim).trim();
      setTranscript(current);
      onResultRef.current?.(current);
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are expected; surface anything else.
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(event.error);
      }
    };

    rec.onend = () => {
      setIsListening(false);
      onEndRef.current?.(accumulatedRef.current.trim());
    };

    rec.start();
  }, [SpeechRecognitionCtor, continuous, lang]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      recogniserRef.current?.abort();
    };
  }, []);

  return { startListening, stopListening, isListening, transcript, error, supported };
}
