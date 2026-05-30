import { useCallback, useEffect, useRef, useState } from "react";
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
  /**
   * Begin a recording session and stream live transcripts to `onTranscript`.
   * Pass `seed` to resume an existing transcript: newly spoken words are
   * appended after it instead of starting from an empty buffer.
   */
  start: (seed?: string) => Promise<void>;
  /**
   * Request microphone permission *now*, synchronously within a user gesture
   * (e.g. the mic-button click handler). Safari/iOS/Private-mode only show the
   * permission prompt when getUserMedia is reached directly from a gesture's
   * call stack, so callers should `void requestPermission()` from the click
   * handler before flipping recording state on. Resolves true if granted (or
   * already granted); on denial/error it sets `error` and resolves false.
   */
  requestPermission: () => Promise<boolean>;
  /** End the session; resolves with the full final transcript. */
  stop: () => string;
  /** True while a connection is active. */
  active: boolean;
  /** Last error encountered (token fetch, mic permission, or Scribe error). */
  error: string | null;
}

interface UseScribeOptions {
  /**
   * Fired once per session the first time a natural pause is detected (the
   * first committed transcript segment settles). Used to reveal a
   * tap-to-continue prompt without ending the recording. Requires non-empty
   * speech first.
   */
  onFirstPause?: () => void;
  /** Debounce (ms) after a committed segment before `onFirstPause` fires. */
  pauseDebounceMs?: number;
}

// The Scribe client emits the generic ERROR event with several different
// payload shapes: a structured `{ error: string }` message, a JS `Error`
// (unexpected close / parse failure), or a bare DOM `Event` (WebSocket error,
// which carries no message at all). Pull out the most useful string from any
// of them so we never surface a contentless "Scribe error".
function describeScribeError(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (data instanceof Error) return data.message || null;
  if (typeof data === "object") {
    const obj = data as { error?: unknown; message?: unknown; type?: unknown };
    if (typeof obj.error === "string" && obj.error) return obj.error;
    if (typeof obj.message === "string" && obj.message) return obj.message;
    // A DOM `Event` (e.g. the WebSocket "error" event) has no useful detail —
    // treat it as an unknown transport error rather than a contentless string.
    if (typeof obj.type === "string" && obj.type === "error") return null;
  }
  return null;
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

/**
 * Request microphone permission *eagerly*, synchronously within the user
 * gesture that started recording — before any `await` on the network.
 *
 * Why this matters on Safari (desktop, iOS, and Private Browsing):
 *   • Safari/WebKit only shows the mic permission prompt when `getUserMedia`
 *     is reached directly from a user gesture's call stack. The Scribe client
 *     calls `getUserMedia` internally, but only *after* we `await fetchToken()`
 *     — by then the gesture has expired and Safari silently refuses, so the
 *     prompt never appears and the connection dies with an opaque error.
 *   • Calling `getUserMedia` first "primes" the permission. Once granted, the
 *     library's later `getUserMedia` reuses it without a second prompt.
 *   • In Safari Private Browsing the grant is per-tab and not remembered, so it
 *     must be re-requested each session — this eager call handles that too.
 *
 * We immediately stop the primer stream's tracks: we only needed the grant,
 * and Scribe opens its own stream once connected.
 */
async function primeMicrophonePermission(): Promise<void> {
  // Secure context is required for getUserMedia. Safari treats some hosts
  // (and any plain-http origin) as insecure and won't expose mediaDevices.
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      throw new Error(
        "Microphone needs a secure connection. Open this over HTTPS (or localhost) to record.",
      );
    }
    throw new Error(
      "This browser doesn't support microphone capture. Try Safari or Chrome.",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    throw new Error(describeMicError(err));
  }
  // Release the primer immediately; Scribe will open its own stream.
  for (const track of stream.getTracks()) track.stop();
}

// Turn a getUserMedia rejection into an actionable, Safari-aware message.
function describeMicError(err: unknown): string {
  const name =
    err instanceof DOMException || (err && typeof err === "object" && "name" in err)
      ? String((err as { name?: unknown }).name ?? "")
      : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      // Safari surfaces a denied/blocked prompt as NotAllowedError. On iOS the
      // grant is also revoked when the page is backgrounded mid-prompt.
      return "Microphone access was blocked. Allow the microphone for this site (Safari: aA menu or Settings ▸ Safari ▸ Microphone) and try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone was found. Check that one is connected and enabled.";
    case "NotReadableError":
      return "Your microphone is in use by another app. Close it and try again.";
    case "AbortError":
      return "Couldn't start the microphone. Try again.";
    default:
      return err instanceof Error && err.message
        ? err.message
        : "Couldn't access the microphone.";
  }
}

export function useScribe(
  onTranscript: (text: string) => void,
  options: UseScribeOptions = {},
): UseScribeResult {
  const { onFirstPause, pauseDebounceMs = 700 } = options;
  const connRef = useRef<RealtimeConnection | null>(null);
  const committedRef = useRef("");
  // True once we intentionally close the socket, so the ERROR/close events the
  // client emits during teardown don't surface as a spurious "Scribe error".
  const closingRef = useRef(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest pause callback in a ref so `start` stays stable.
  const onFirstPauseRef = useRef(onFirstPause);
  useEffect(() => {
    onFirstPauseRef.current = onFirstPause;
  }, [onFirstPause]);
  const firstPauseFiredRef = useRef(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      await primeMicrophonePermission();
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  const start = useCallback(async (seed?: string) => {
    setError(null);
    closingRef.current = false;
    // Seed lets a paused/keyboard-edited entry resume: new speech is committed
    // after the existing text instead of replacing it.
    committedRef.current = seed?.trim() ?? "";
    firstPauseFiredRef.current = false;
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);

    // Request the mic permission FIRST, inside the user gesture that called
    // start(), before any network await. Safari only prompts when
    // getUserMedia is reached directly from the gesture stack; the Scribe
    // client's own getUserMedia runs after our token fetch and would be too
    // late. Priming here makes the prompt reliable on Safari/iOS/Private mode.
    try {
      await primeMicrophonePermission();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }

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

      // First natural pause with real speech → reveal the tap-to-continue
      // affordance (after a short debounce). Fires at most once per session.
      if (!firstPauseFiredRef.current && committedRef.current.trim()) {
        if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
        pauseTimerRef.current = setTimeout(() => {
          if (firstPauseFiredRef.current) return;
          firstPauseFiredRef.current = true;
          onFirstPauseRef.current?.();
        }, pauseDebounceMs);
      }
    });

    connection.on(RealtimeEvents.ERROR, (data) => {
      // Ignore errors emitted while we're tearing the socket down on purpose
      // (a normal close surfaces as an ERROR with an empty payload).
      if (closingRef.current) return;
      const message = describeScribeError(data);
      // A bare WebSocket "error" event carries no detail and is often
      // transient (it's followed by a close event with the real reason).
      // Skip those so we don't flash a contentless error; the close handler
      // surfaces the actionable message if the disconnect was unclean.
      if (!message) return;
      setError(message);
    });

    connection.on(RealtimeEvents.CLOSE, (event) => {
      if (closingRef.current) return;
      // A clean close (1000/1005) is the expected end of a turn — no error.
      const clean =
        event?.wasClean || event?.code === 1000 || event?.code === 1005;
      if (clean) return;
      setError(
        event?.reason
          ? `Connection closed: ${event.reason}`
          : "Connection closed unexpectedly. Check your network and mic permission.",
      );
    });

    connection.on(RealtimeEvents.AUTH_ERROR, (data) => {
      if (closingRef.current) return;
      setError(describeScribeError(data) ?? "Scribe authentication failed");
    });

    connRef.current = connection;
    setActive(true);
  }, [onTranscript, pauseDebounceMs]);

  const stop = useCallback(() => {
    closingRef.current = true;
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    connRef.current?.close();
    connRef.current = null;
    setActive(false);
    // Clear any prior error so a stale message never lingers once we've
    // stopped listening; a real error only shows during an active session.
    setError(null);
    return committedRef.current;
  }, []);

  return { start, requestPermission, stop, active, error };
}
