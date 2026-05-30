/**
 * Gemini Live API WebSocket proxy.
 *
 * This is the backend "route" for real-time audio. The browser connects to
 * this WebSocket; we open a Gemini Live session per client and relay:
 *   browser → Gemini : 16 kHz mono PCM16 microphone audio (binary frames)
 *   Gemini → browser : AI audio (24 kHz PCM16) + input/output transcripts (JSON)
 *
 * The API key stays here (server-side) and is read from the GEMINI_API_KEY
 * environment variable — it is NEVER sent to the browser or committed.
 *
 * Run with:  npm run server   (loads .env if present)
 * Docs: https://ai.google.dev/gemini-api/docs/live
 */
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";

const PORT = Number(process.env.LIVE_WS_PORT || 8787);
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.0-flash-live-001";

const SYSTEM_INSTRUCTION =
  "You are Margo, a warm, concise journaling companion. Speak gently and " +
  "ask one short reflective question at a time. Keep responses brief.";

if (!API_KEY) {
  console.error(
    "[live] Missing GEMINI_API_KEY. Add it to .env (see .env.example) and restart.",
  );
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (clientWs) => {
  console.log("[live] client connected");

  const send = (obj) => {
    if (clientWs.readyState === clientWs.OPEN) clientWs.send(JSON.stringify(obj));
  };

  let session = null;
  try {
    session = await ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        // Ask Gemini for live transcripts of both sides of the conversation.
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction: SYSTEM_INSTRUCTION,
      },
      callbacks: {
        onopen: () => send({ type: "ready" }),
        onmessage: (message) => {
          const sc = message.serverContent;

          // The user's speech, transcribed.
          const userText = sc?.inputTranscription?.text;
          if (userText) send({ type: "user_text", text: userText });

          // The AI's speech, transcribed (drives latestQuestionText).
          const aiText = sc?.outputTranscription?.text;
          if (aiText) send({ type: "ai_text", text: aiText });

          // The AI's audio + any inline text parts.
          const parts = sc?.modelTurn?.parts ?? [];
          for (const part of parts) {
            if (part.inlineData?.data) {
              send({
                type: "audio",
                data: part.inlineData.data,
                mimeType: part.inlineData.mimeType || "audio/pcm;rate=24000",
              });
            }
            if (part.text) send({ type: "ai_text", text: part.text });
          }

          if (sc?.interrupted) send({ type: "interrupted" });
          if (sc?.turnComplete) send({ type: "turn_complete" });
        },
        onerror: (e) =>
          send({ type: "error", message: String(e?.message || e) }),
        onclose: () => {
          if (clientWs.readyState === clientWs.OPEN) clientWs.close();
        },
      },
    });
  } catch (e) {
    console.error("[live] failed to open Gemini session:", e?.message || e);
    send({
      type: "error",
      message: "Failed to connect to Gemini: " + String(e?.message || e),
    });
    clientWs.close();
    return;
  }

  clientWs.on("message", (data, isBinary) => {
    if (!session) return;
    try {
      if (isBinary) {
        // Raw 16 kHz mono PCM16 microphone chunk → forward to Gemini.
        const base64 = Buffer.from(data).toString("base64");
        session.sendRealtimeInput({
          audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
        });
        return;
      }
      // JSON control messages.
      const msg = JSON.parse(data.toString());
      if (msg.type === "text" && msg.text) {
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: msg.text }] }],
          turnComplete: true,
        });
      } else if (msg.type === "audio_end") {
        // Tell Gemini the user stopped talking (end of audio stream).
        session.sendRealtimeInput({ audioStreamEnd: true });
      }
    } catch (err) {
      console.error("[live] message handling error:", err?.message || err);
    }
  });

  clientWs.on("close", () => {
    console.log("[live] client disconnected");
    try {
      session?.close();
    } catch {
      /* ignore */
    }
  });
});

console.log(
  `[live] Gemini Live proxy listening on ws://localhost:${PORT} (model: ${MODEL})`,
);
