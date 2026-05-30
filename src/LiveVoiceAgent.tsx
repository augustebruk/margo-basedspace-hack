import { useCallback, useEffect, useRef, useState, type JSX } from "react";

interface LiveVoiceAgentProps {
  onAiSpeakingChange?: (speaking: boolean) => void;
  onPersonSpeakingChange?: (speaking: boolean) => void;
  onQuestion?: (question: string) => void;
  onTranscript?: (text: string) => void;
}

/* ───── Audio helpers ───── */

const float32ToPcm16 = (float32: Float32Array): Int16Array => {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 32768 : s * 32767;
  }
  return pcm16;
};

const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const base64ToFloat32 = (b64: string): Float32Array => {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const out = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) out[i] = int16[i] / 32768;
  return out;
};

/* ───── Component ───── */

export const LiveVoiceAgent = ({
  onAiSpeakingChange,
  onPersonSpeakingChange,
  onQuestion,
  onTranscript,
}: LiveVoiceAgentProps): JSX.Element => {
  const [isConnected, setIsConnected] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [personSpeaking, setPersonSpeaking] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);

  // Store callbacks in refs so the WS handler always sees the latest
  const cbRefs = useRef({ onAiSpeakingChange, onPersonSpeakingChange, onQuestion, onTranscript });
  useEffect(() => {
    cbRefs.current = { onAiSpeakingChange, onPersonSpeakingChange, onQuestion, onTranscript };
  });

  // Bubble state to parent
  useEffect(() => { cbRefs.current.onAiSpeakingChange?.(aiSpeaking); }, [aiSpeaking]);
  useEffect(() => { cbRefs.current.onPersonSpeakingChange?.(personSpeaking); }, [personSpeaking]);
  useEffect(() => { cbRefs.current.onTranscript?.(userTranscript); }, [userTranscript]);

  /* ── Audio playback ── */

  const scheduleAudio = useCallback((b64: string) => {
    if (!playCtxRef.current) playCtxRef.current = new AudioContext({ sampleRate: 24000 });
    const ctx = playCtxRef.current;
    const samples = base64ToFloat32(b64);
    const buf = ctx.createBuffer(1, samples.length, 24000);
    buf.getChannelData(0).set(samples);

    const now = ctx.currentTime;
    const start = Math.max(now, nextPlayTimeRef.current);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(start);
    nextPlayTimeRef.current = start + buf.duration;
  }, []);

  /* ── Stop recording ── */

  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPersonSpeaking(false);
    setIsMicActive(false);
  }, []);

  /* ── Connect ── */

  const connect = useCallback(() => {
    setError(null);
    const wsUrl = `ws://${window.location.hostname}:8787`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[v0] WS open, waiting for backend connected msg");
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case "connected":
            setIsConnected(true);
            break;
          case "audio":
            setAiSpeaking(true);
            scheduleAudio(msg.data);
            break;
          case "text":
            setCurrentTranscript(msg.text);
            cbRefs.current.onQuestion?.(msg.text);
            setAiSpeaking(true);
            break;
          case "outputTranscript":
            setCurrentTranscript((prev) => prev + msg.text);
            cbRefs.current.onQuestion?.(msg.text);
            break;
          case "inputTranscript":
            setUserTranscript((prev) => prev + msg.text);
            break;
          case "turnComplete":
            setAiSpeaking(false);
            break;
          case "error":
            setError(msg.message);
            break;
        }
      } catch (err) {
        console.error("[v0] WS message parse error:", err);
      }
    };

    ws.onerror = () => setError("Connection error");

    ws.onclose = () => {
      setIsConnected(false);
      setIsMicActive(false);
      stopRecording();
    };

    wsRef.current = ws;
  }, [scheduleAudio, stopRecording]);

  /* ── Disconnect ── */

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setIsMicActive(false);
    stopRecording();
  }, [stopRecording]);

  /* ── Start recording ── */

  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected");
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setPersonSpeaking(true);
      setIsMicActive(true);
      setUserTranscript("");

      const ctx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      sourceRef.current = src;

      const proc = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = proc;
      proc.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const pcm16 = float32ToPcm16(e.inputBuffer.getChannelData(0));
        wsRef.current.send(
          JSON.stringify({ type: "audio", data: arrayBufferToBase64(pcm16.buffer) })
        );
      };
      src.connect(proc);
      proc.connect(ctx.destination);
    } catch (err: any) {
      setError(err.message);
      setPersonSpeaking(false);
      setIsMicActive(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      stopRecording();
      playCtxRef.current?.close();
    };
  }, [stopRecording]);

  /* ── UI ── */

  return (
    <div className="flex flex-col gap-4 w-full max-w-md">
      {/* Buttons */}
      <div className="flex gap-3">
        <button
          onClick={isConnected ? disconnect : connect}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-base transition-colors ${
            isConnected
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </button>

        <button
          onClick={isMicActive ? stopRecording : startRecording}
          disabled={!isConnected}
          className={`flex-1 px-4 py-3 rounded-xl font-medium text-base transition-colors ${
            isMicActive
              ? "bg-orange-500 text-white hover:bg-orange-600"
              : isConnected
                ? "bg-green-500 text-white hover:bg-green-600"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isMicActive ? "Stop Mic" : "Start Mic"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* Status row */}
      <div className="flex gap-3 text-xs text-gray-500">
        <span className={isConnected ? "text-green-600 font-semibold" : ""}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
        <span className="text-gray-300">|</span>
        <span className={isMicActive ? "text-orange-600 font-semibold" : ""}>
          Mic {isMicActive ? "On" : "Off"}
        </span>
        <span className="text-gray-300">|</span>
        <span className={aiSpeaking ? "text-blue-600 font-semibold" : ""}>
          AI {aiSpeaking ? "Speaking" : "Silent"}
        </span>
      </div>

      {/* AI transcript */}
      {currentTranscript && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="text-xs font-semibold text-blue-600 mb-1">AI</div>
          <div className="text-sm text-blue-900">{currentTranscript}</div>
        </div>
      )}

      {/* User transcript */}
      {userTranscript && (
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="text-xs font-semibold text-gray-500 mb-1">You</div>
          <div className="text-sm text-gray-800">{userTranscript}</div>
        </div>
      )}
    </div>
  );
};
