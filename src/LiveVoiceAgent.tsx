import { useCallback, useEffect, useRef, useState, type JSX } from "react";

interface LiveVoiceAgentProps {
  onAiSpeakingChange?: (speaking: boolean) => void;
  onPersonSpeakingChange?: (speaking: boolean) => void;
  onQuestion?: (question: string) => void;
  onTranscript?: (text: string) => void;
}

const float32ToPcm16 = (float32Array: Float32Array): Int16Array => {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const clamp = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = clamp < 0 ? clamp * 32768 : clamp * 32767;
  }
  return pcm16;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToFloat32 = (base64: string): Float32Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Reinterpret as Int16 (little-endian)
  const int16Array = new Int16Array(bytes.buffer);
  
  // Convert to float32
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768;
  }
  
  return float32Array;
};

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
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);

  // Notify parent of state changes
  useEffect(() => {
    onAiSpeakingChange?.(aiSpeaking);
  }, [aiSpeaking, onAiSpeakingChange]);

  useEffect(() => {
    onPersonSpeakingChange?.(personSpeaking);
  }, [personSpeaking, onPersonSpeakingChange]);

  useEffect(() => {
    onTranscript?.(currentTranscript);
  }, [currentTranscript, onTranscript]);

  // Connect to backend WebSocket
  const connect = useCallback(() => {
    setError(null);
    try {
      const wsUrl = `ws://${window.location.hostname}:8787`;
      console.log("[LiveVoiceAgent] Connecting to", wsUrl);
      
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("[LiveVoiceAgent] Connected to backend");
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "text" && msg.text) {
            console.log("[LiveVoiceAgent] AI text:", msg.text);
            setCurrentTranscript(msg.text);
            onQuestion?.(msg.text);
            setAiSpeaking(true);
          } else if (msg.type === "audio" && msg.data) {
            console.log("[LiveVoiceAgent] Received AI audio chunk");
            // Queue for playback (24kHz PCM16)
            scheduleAudioPlayback(msg.data);
          } else if (msg.type === "turnComplete") {
            console.log("[LiveVoiceAgent] Turn complete");
            setAiSpeaking(false);
          } else if (msg.type === "error") {
            console.error("[LiveVoiceAgent] Server error:", msg.message);
            setError(msg.message);
          }
        } catch (err) {
          console.error("[LiveVoiceAgent] Message parse error:", err);
        }
      };

      ws.onerror = (err) => {
        console.error("[LiveVoiceAgent] WebSocket error:", err);
        setError("Connection error");
      };

      ws.onclose = () => {
        console.log("[LiveVoiceAgent] Disconnected from backend");
        setIsConnected(false);
        setIsMicActive(false);
        stopRecording();
      };

      wsRef.current = ws;
    } catch (err: any) {
      console.error("[LiveVoiceAgent] Connection failed:", err.message);
      setError(err.message);
    }
  }, [onQuestion]);

  // Disconnect from backend WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setIsMicActive(false);
  }, []);

  // Start recording mic and sending to backend
  const startRecording = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to backend");
      return;
    }

    setError(null);
    try {
      // Request microphone
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
      console.log("[LiveVoiceAgent] Recording started");

      // Create audio context (16kHz)
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Use ScriptProcessorNode for audio processing
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = event.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(inputData);
        const base64Audio = arrayBufferToBase64(pcm16.buffer);

        // Send audio chunk to backend
        wsRef.current.send(
          JSON.stringify({
            type: "audio",
            data: base64Audio,
          })
        );
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err: any) {
      console.error("[LiveVoiceAgent] Microphone error:", err.message);
      setError(err.message);
      setPersonSpeaking(false);
      setIsMicActive(false);
    }
  }, []);

  // Stop recording mic
  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setPersonSpeaking(false);
    setIsMicActive(false);
    console.log("[LiveVoiceAgent] Recording stopped");
  }, []);

  // Schedule audio playback (24kHz PCM16 from server)
  const scheduleAudioPlayback = useCallback((base64Audio: string) => {
    try {
      // Initialize playback context if needed
      if (!playbackContextRef.current) {
        playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const audioCtx = playbackContextRef.current;
      const float32Data = base64ToFloat32(base64Audio);

      // Create audio buffer from float32 data
      const audioBuffer = audioCtx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      // Queue for playback
      audioQueueRef.current.push(audioBuffer);
      playNextAudioBuffer();
    } catch (err) {
      console.error("[LiveVoiceAgent] Audio decode error:", err);
    }
  }, []);

  // Play audio buffers from the queue
  const playNextAudioBuffer = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
    }

    const audioCtx = playbackContextRef.current;
    const audioBuffer = audioQueueRef.current.shift();

    if (!audioBuffer) {
      return;
    }

    isPlayingRef.current = true;

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx.destination);

    source.onended = () => {
      isPlayingRef.current = false;
      playNextAudioBuffer();
    };

    source.start(0);
  }, []);

  const handleMicToggle = () => {
    if (isMicActive) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex gap-2">
        <button
          onClick={isConnected ? disconnect : connect}
          className={`px-4 py-2 rounded font-medium transition ${
            isConnected
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-blue-500 text-white hover:bg-blue-600"
          }`}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </button>

        <button
          onClick={handleMicToggle}
          disabled={!isConnected}
          className={`px-4 py-2 rounded font-medium transition ${
            isMicActive
              ? "bg-orange-500 text-white hover:bg-orange-600"
              : isConnected
                ? "bg-green-500 text-white hover:bg-green-600"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
          }`}
        >
          {isMicActive ? "Stop Mic" : "Start Mic"}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-100 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <div className="text-sm text-gray-600">
        <div>
          Status:{" "}
          <span className="font-semibold">
            {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
          </span>
        </div>
        <div>
          Mic: <span className="font-semibold">{isMicActive ? "🎤 Active" : "🔇 Idle"}</span>
        </div>
        <div>
          AI Speaking: <span className="font-semibold">{aiSpeaking ? "🔊 Yes" : "🔇 No"}</span>
        </div>
        <div>
          You Speaking: <span className="font-semibold">{personSpeaking ? "🎤 Yes" : "🔇 No"}</span>
        </div>
      </div>

      {currentTranscript && (
        <div className="p-3 bg-blue-50 rounded border border-blue-200">
          <div className="text-xs font-semibold text-blue-700 mb-1">Latest Message</div>
          <div className="text-sm text-blue-900">{currentTranscript}</div>
        </div>
      )}
    </div>
  );
};
