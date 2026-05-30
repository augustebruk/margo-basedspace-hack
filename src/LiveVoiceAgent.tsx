import { useCallback, useEffect, useRef, useState, type JSX } from "react";

/* ============================================================================
 * <LiveVoiceAgent /> — real-time voice via the Gemini Live API.
 *
 * Talks to our backend WebSocket proxy (server/liveServer.mjs), which keeps the
 * API key server-side. This component:
 *   • Connect / Disconnect the WebSocket.
 *   • Start / Stop the mic → streams 16 kHz PCM16 to the backend.
 *   • Plays the AI's 24 kHz PCM16 audio.
 *   • Surfaces text/transcript + speaking state via callbacks so it can drive
 *     the existing UI (bulb state, question, transcript).
 * ==========================================================================*/
export interface LiveVoiceAgentProps {
  /** Backend WS proxy URL. Defaults to VITE_LIVE_WS_URL or ws://localhost:8787 */
  wsUrl?: string;
  /** Fired when the AI starts/stops speaking. */
  onAiSpeakingChange?: (speaking: boolean) => void;
  /** Fired when the person starts/stops speaking (mic on/off). */
  onPersonSpeakingChange?: (speaking: boolean) => void;
  /** Latest AI message text (the current question). */
  onQuestion?: (text: string) => void;
  /** Live transcript of the person speaking. */
  onTranscript?: (text: string) => void;
  className?: string;
}

type Status = "disconnected" | "connecting" | "connected" | "error";

const DEFAULT_WS_URL =
  (import.meta.env.VITE_LIVE_WS_URL as string | undefined) ??
  "ws://localhost:8787";

const INPUT_SAMPLE_RATE = 16000; // Gemini expects 16 kHz mono PCM16 input.
const OUTPUT_SAMPLE_RATE = 24000; // Gemini streams 24 kHz PCM16 output.

// Downsample a Float32 buffer (at `inRate`) to 16 kHz Int16 PCM.
function floatToPcm16(input: Float32Array, inRate: number): ArrayBuffer {
  const ratio = inRate / INPUT_SAMPLE_RATE;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

// Decode base64 PCM16 into a Float32Array of samples in [-1, 1].
function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const int16 = new Int16Array(len / 2);
  for (let i = 0; i < int16.length; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    const val = (hi << 8) | lo;
    int16[i] = val >= 0x8000 ? val - 0x10000 : val;
  }
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 0x8000;
  return out;
}

export const LiveVoiceAgent = ({
  wsUrl = DEFAULT_WS_URL,
  onAiSpeakingChange,
  onPersonSpeakingChange,
  onQuestion,
  onTranscript,
  className,
}: LiveVoiceAgentProps): JSX.Element => {
  const [status, setStatus] = useState<Status>("disconnected");
  const [micOn, setMicOn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Mic capture graph.
  const micCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // AI audio playback graph + scheduling cursor.
  const playCtxRef = useRef<AudioContext | null>(null);
  const playCursorRef = useRef(0);
  const playingUntilRef = useRef(0);
  const aiSpeakingRef = useRef(false);

  // Accumulated text for the current AI turn / user transcript.
  const questionRef = useRef("");
  const transcriptRef = useRef("");

  const setAiSpeaking = useCallback(
    (v: boolean) => {
      if (aiSpeakingRef.current === v) return;
      aiSpeakingRef.current = v;
      onAiSpeakingChange?.(v);
    },
    [onAiSpeakingChange],
  );

  const ensurePlaybackCtx = useCallback(() => {
    if (!playCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      playCtxRef.current = new Ctor();
    }
    return playCtxRef.current;
  }, []);

  // Schedule a chunk of AI audio right after the previously queued one.
  const playAudioChunk = useCallback(
    (base64: string) => {
      const ctx = ensurePlaybackCtx();
      const samples = base64Pcm16ToFloat32(base64);
      if (samples.length === 0) return;
      const buffer = ctx.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
      buffer.copyToChannel(samples, 0);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);

      const now = ctx.currentTime;
      const startAt = Math.max(now, playCursorRef.current);
      src.start(startAt);
      playCursorRef.current = startAt + buffer.duration;
      playingUntilRef.current = playCursorRef.current;

      setAiSpeaking(true);
      // Flip aiSpeaking off shortly after the last scheduled chunk finishes.
      window.setTimeout(
        () => {
          if (ctx.currentTime >= playingUntilRef.current - 0.05) {
            setAiSpeaking(false);
          }
        },
        Math.ceil((playingUntilRef.current - now + 0.1) * 1000),
      );
    },
    [ensurePlaybackCtx, setAiSpeaking],
  );

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (micCtxRef.current) {
      micCtxRef.current.close().catch(() => {});
      micCtxRef.current = null;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "audio_end" }));
    }
    setMicOn(false);
    onPersonSpeakingChange?.(false);
  }, [onPersonSpeakingChange]);

  const disconnect = useCallback(() => {
    stopMic();
    wsRef.current?.close();
    wsRef.current = null;
    playCtxReset();
    setStatus("disconnected");
    setAiSpeaking(false);
    function playCtxReset() {
      playCursorRef.current = 0;
      playingUntilRef.current = 0;
    }
  }, [stopMic, setAiSpeaking]);

  const connect = useCallback(() => {
    if (wsRef.current) return;
    setErrorMsg(null);
    setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      setStatus("error");
      setErrorMsg(String(e));
      return;
    }
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      switch (msg.type) {
        case "ready":
          setStatus("connected");
          break;
        case "ai_text": {
          questionRef.current += String(msg.text ?? "");
          onQuestion?.(questionRef.current.trim());
          setAiSpeaking(true);
          break;
        }
        case "user_text": {
          transcriptRef.current += String(msg.text ?? "");
          onTranscript?.(transcriptRef.current.trim());
          break;
        }
        case "audio":
          if (typeof msg.data === "string") playAudioChunk(msg.data);
          break;
        case "turn_complete":
          // Next AI turn starts a fresh question/transcript.
          questionRef.current = "";
          transcriptRef.current = "";
          break;
        case "interrupted":
          playCursorRef.current = 0;
          setAiSpeaking(false);
          break;
        case "error":
          setStatus("error");
          setErrorMsg(String(msg.message ?? "Unknown error"));
          break;
      }
    };
    ws.onerror = () => {
      setStatus("error");
      setErrorMsg("WebSocket error — is the backend (npm run server) running?");
    };
    ws.onclose = () => {
      wsRef.current = null;
      setStatus((s) => (s === "error" ? s : "disconnected"));
    };
  }, [wsUrl, onQuestion, onTranscript, playAudioChunk, setAiSpeaking]);

  const startMic = useCallback(async () => {
    if (status !== "connected") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      micCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (e) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        ws.send(floatToPcm16(input, ctx.sampleRate));
      };
      source.connect(processor);
      processor.connect(ctx.destination);
      setMicOn(true);
      onPersonSpeakingChange?.(true);
    } catch (e) {
      setErrorMsg("Mic access failed: " + String(e));
    }
  }, [status, onPersonSpeakingChange]);

  // Clean up everything on unmount.
  useEffect(() => {
    return () => {
      processorRef.current?.disconnect();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micCtxRef.current?.close().catch(() => {});
      playCtxRef.current?.close().catch(() => {});
      wsRef.current?.close();
    };
  }, []);

  const connected = status === "connected";
  const statusColor =
    status === "connected"
      ? "#34c759"
      : status === "connecting"
        ? "#e6a6c1"
        : status === "error"
          ? "#e06a6a"
          : "#c0c6cf";

  return (
    <div
      className={
        "flex w-full flex-col items-center gap-2 rounded-[18px] border border-[#e7e2ef] bg-white/85 px-4 py-3 " +
        (className ?? "")
      }
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
        <span className="[font-family:'Inter',Helvetica] text-[12px] font-medium text-[#1c2b33]/60">
          Live voice (Gemini) · {status}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={connected || status === "connecting" ? disconnect : connect}
          className="all-[unset] box-border cursor-pointer rounded-full border border-[#e7e2ef] bg-white px-4 py-2 [font-family:'Inter',Helvetica] text-[13px] font-medium text-[#1c2b33]/80 hover:bg-[#faf7ff]"
        >
          {connected || status === "connecting" ? "Disconnect" : "Connect"}
        </button>

        <button
          type="button"
          disabled={!connected}
          onClick={micOn ? stopMic : startMic}
          className={
            "all-[unset] box-border rounded-full px-4 py-2 [font-family:'Inter',Helvetica] text-[13px] font-semibold transition-colors " +
            (!connected
              ? "cursor-not-allowed bg-[#f1f1f4] text-[#1c2b33]/30"
              : micOn
                ? "cursor-pointer bg-[linear-gradient(90deg,#c7a6f5,#ec9fc4)] text-white"
                : "cursor-pointer bg-[rgba(244,231,255,0.7)] text-[#1c2b33]")
          }
        >
          {micOn ? "Stop mic" : "Start mic"}
        </button>
      </div>

      {errorMsg && (
        <p className="max-w-[300px] text-center [font-family:'Inter',Helvetica] text-[11px] leading-[15px] text-[#e06a6a]">
          {errorMsg}
        </p>
      )}
    </div>
  );
};
