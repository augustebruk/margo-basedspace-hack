import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: "/vercel/share/.env.project" });

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.5-flash-live-preview";
const PORT = process.env.WS_PORT || 8787;

if (!API_KEY) {
  console.error("GEMINI_API_KEY is not set. Please add it to your environment.");
  process.exit(1);
}

// Gemini Live API WebSocket endpoint
const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (browserWs) => {
  console.log("[WS] Browser connected");
  const sessionId = Math.random().toString(36).substring(7);

  let geminiWs = null;
  let setupSent = false;

  // Open raw WebSocket to Gemini Live API
  geminiWs = new WebSocket(GEMINI_WS_URL);

  geminiWs.on("open", () => {
    console.log(`[${sessionId}] Gemini WS opened, sending setup...`);

    // Send the setup message (must be the first message)
    const setupMsg = {
      setup: {
        model: `models/${MODEL}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Aoede" },
            },
          },
        },
        systemInstruction: {
          parts: [
            {
              text:
                "You are a thoughtful companion for introspection and journaling. " +
                "Ask clarifying questions to help the user explore their feelings and experiences. " +
                "Be warm, empathetic, and genuine. Keep responses concise.",
            },
          ],
        },
        outputAudioTranscription: {},
        inputAudioTranscription: {},
      },
    };

    geminiWs.send(JSON.stringify(setupMsg));
    console.log(`[${sessionId}] Setup message sent`);
  });

  geminiWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // First response after setup is the setupComplete acknowledgment
      if (msg.setupComplete !== undefined && !setupSent) {
        setupSent = true;
        console.log(`[${sessionId}] Setup complete - session ready`);
        browserWs.send(JSON.stringify({ type: "connected" }));
        return;
      }

      // Model turn with audio/text
      if (msg.serverContent?.modelTurn) {
        const parts = msg.serverContent.modelTurn.parts || [];
        for (const part of parts) {
          if (part.text) {
            browserWs.send(JSON.stringify({ type: "text", text: part.text }));
            console.log(`[${sessionId}] AI text: ${part.text.substring(0, 60)}`);
          }
          if (part.inlineData) {
            browserWs.send(
              JSON.stringify({
                type: "audio",
                data: part.inlineData.data,
                mimeType: part.inlineData.mimeType,
              })
            );
          }
        }
      }

      // Output transcription (what the AI said)
      if (msg.serverContent?.outputTranscription?.text) {
        browserWs.send(
          JSON.stringify({
            type: "outputTranscript",
            text: msg.serverContent.outputTranscription.text,
          })
        );
      }

      // Input transcription (what the user said)
      if (msg.serverContent?.inputTranscription?.text) {
        browserWs.send(
          JSON.stringify({
            type: "inputTranscript",
            text: msg.serverContent.inputTranscription.text,
          })
        );
      }

      // Turn complete
      if (msg.serverContent?.turnComplete) {
        browserWs.send(JSON.stringify({ type: "turnComplete" }));
        console.log(`[${sessionId}] Turn complete`);
      }
    } catch (err) {
      console.error(`[${sessionId}] Error processing Gemini message:`, err);
    }
  });

  geminiWs.on("error", (err) => {
    console.error(`[${sessionId}] Gemini WS error:`, err.message);
    try {
      browserWs.send(JSON.stringify({ type: "error", message: err.message }));
    } catch (_) {}
  });

  geminiWs.on("close", (code, reason) => {
    console.log(`[${sessionId}] Gemini WS closed: ${code} ${reason?.toString() || ""}`);
    try {
      browserWs.close();
    } catch (_) {}
  });

  // Handle messages FROM the browser
  browserWs.on("message", (data) => {
    if (!geminiWs || geminiWs.readyState !== WebSocket.OPEN) return;

    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "audio" && msg.data) {
        // Forward audio as realtimeInput
        geminiWs.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks: [
                {
                  mimeType: "audio/pcm;rate=16000",
                  data: msg.data,
                },
              ],
            },
          })
        );
      } else if (msg.type === "text" && msg.text) {
        // Forward text as clientContent
        geminiWs.send(
          JSON.stringify({
            clientContent: {
              turns: [{ role: "user", parts: [{ text: msg.text }] }],
              turnComplete: true,
            },
          })
        );
        console.log(`[${sessionId}] Forwarded text: ${msg.text.substring(0, 50)}`);
      }
    } catch (err) {
      console.error(`[${sessionId}] Browser msg parse error:`, err.message);
    }
  });

  browserWs.on("close", () => {
    console.log(`[${sessionId}] Browser disconnected`);
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });

  browserWs.on("error", (err) => {
    console.error(`[${sessionId}] Browser WS error:`, err.message);
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });
});

console.log(`WebSocket server listening on ws://localhost:${PORT}`);
console.log(`Using model: ${MODEL}`);
