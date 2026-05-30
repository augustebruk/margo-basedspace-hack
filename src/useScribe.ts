import { useCallback, useRef, useState } from "react";
import {
  Scribe,
  CommitStrategy,
  RealtimeEvents,
  type RealtimeConnection,
} from "@elevenlabs/client";

/**
 * Live speech-to-text via ElevenLabs Scribe v2 Realtime.
 *
 * The hook owns a single WebSocket connection per recording session. It mints a
 * short-lived single-use token from `/api/scribe-token` (server-side; the raw
 * API key never reaches the browser), then opens the Scribe connection and
 * streams the microphone automatically.
 *
 * Transcript handling: Scribe emits `partial_transcript` for in-flight words
 * and `committed_transcript` when a pause finalizes a segment. We keep the
 * committed text in a ref and append the latest partial on top, so the caller
 * always receives the full running transcript.
 */
const MODEL_ID = "scribe_v2_realtime";
const TOKEN_ENDPOINT = "/api/scribe-token";

interface UseScribeResult {
  /** Begin a recording session and stream live transcripts to `onTranscript`. */
  start: () => Promise<void>;
  /** End the session; resolves with the full final transcript. */
  stop: () => string;
  /** True while a connection is active. */
  active: boolean;
  /** Last error encountered (token fetch, mic permission, or Scribe error). */
  error: string | null;
}

async function fetchToken(): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Token request failed (${res.status})`);
  }
  const { token } = (await res.json()) as { token?: string };
  if (!token) throw new Error("Token endpoint returned no token");
  return token;
}

export function useScribe(
  onTranscript: (text: string) => void,
): UseScribeResult {
  const connRef = useRef<RealtimeConnection | null>(null);
  const committedRef = useRef("");
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    committedRef.current = "";

    let token: string;
    try {
      token = await fetchToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

    const connection = Scribe.connect({
      token,
      modelId: MODEL_ID,
      // Turn-based journaling: let the server auto-commit on natural pauses.
      commitStrategy: CommitStrategy.VAD,
      microphone: { echoCancellation: true, noiseSuppression: true },
    });

    connection.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
      const combined = `${committedRef.current} ${data.text}`.trim();
      onTranscript(combined);
    });

    connection.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
      committedRef.current = `${committedRef.current} ${data.text}`.trim();
      onTranscript(committedRef.current);
    });

    connection.on(RealtimeEvents.ERROR, (data) => {
      setError(data.error ?? "Scribe error");
    });

    connection.on(RealtimeEvents.AUTH_ERROR, (data) => {
      setError(data.error ?? "Scribe authentication failed");
    });

    connRef.current = connection;
    setActive(true);
  }, [onTranscript]);

  const stop = useCallback(() => {
    connRef.current?.close();
    connRef.current = null;
    setActive(false);
    return committedRef.current;
  }, []);

  return { start, stop, active, error };
}
