import { WebSocketServer } from "ws";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: "/vercel/share/.env.project" });

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_LIVE_MODEL || "gemini-2.0-flash-live-001";
const PORT = process.env.WS_PORT || 8787;

if (!API_KEY) {
  console.error(
    "❌ GEMINI_API_KEY is not set. Please add it to your environment."
  );
  process.exit(1);
}

const wss = new WebSocketServer({ port: PORT });
const ai = new GoogleGenAI({ apiKey: API_KEY });

wss.on("connection", async (browserWs) => {
  console.log("[WS] Browser connected");

  let geminiSession = null;
  const sessionId = Math.random().toString(36).substring(7);

  try {
    // Establish Gemini Live session
    geminiSession = await ai.live.connect({
      model: MODEL,
      callbacks: {
        onopen: () => {
          console.log(`[${sessionId}] Gemini session opened`);
        },
        onmessage: (msg) => {
          if (msg.serverContent?.modelTurn) {
            const parts = msg.serverContent.modelTurn.parts || [];
            for (const part of parts) {
              // Text response
              if (part.text) {
                browserWs.send(
                  JSON.stringify({
                    type: "text",
                    text: part.text,
                  })
                );
                console.log(`[${sessionId}] AI text: ${part.text.substring(0, 50)}...`);
              }

              // Audio response (24kHz PCM16)
              if (part.inlineData) {
                browserWs.send(
                  JSON.stringify({
                    type: "audio",
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType,
                  })
                );
                console.log(`[${sessionId}] AI audio chunk: ${part.inlineData.data.length} bytes`);
              }
            }
          }

          // Server-side turn complete (user finished speaking, AI is done)
          if (msg.serverContent?.turnComplete) {
            browserWs.send(
              JSON.stringify({
                type: "turnComplete",
              })
            );
            console.log(`[${sessionId}] Turn complete`);
          }
        },
        onerror: (err) => {
          console.error(`[${sessionId}] Gemini error:`, err);
          browserWs.send(
            JSON.stringify({
              type: "error",
              message: err.message,
            })
          );
        },
        onclose: () => {
          console.log(`[${sessionId}] Gemini session closed`);
          browserWs.close();
        },
      },
      config: {
        responseModalities: ["AUDIO", "TEXT"],
        systemInstruction:
          "You are a thoughtful companion for introspection and journaling. " +
          "Ask clarifying questions to help the user explore their feelings and experiences. " +
          "Be warm, empathetic, and genuine.",
      },
    });

    console.log(`[${sessionId}] Gemini session connected`);

    // Notify browser that connection is established
    browserWs.send(
      JSON.stringify({
        type: "connected",
      })
    );

    // Handle browser messages
    browserWs.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "audio" && msg.data) {
          // Browser sent mic audio (16kHz PCM16, base64)
          geminiSession.sendRealtimeInput({
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=16000",
                data: msg.data,
              },
            ],
          });
          console.log(`[${sessionId}] Forwarded audio chunk: ${msg.data.length} chars`);
        } else if (msg.type === "text" && msg.text) {
          // Browser sent text input
          geminiSession.sendClientContent({
            turns: [
              {
                role: "user",
                parts: [{ text: msg.text }],
              },
            ],
          });
          console.log(`[${sessionId}] Forwarded text: ${msg.text.substring(0, 50)}...`);
        }
      } catch (err) {
        console.error(`[${sessionId}] Message parse error:`, err.message);
      }
    });

    browserWs.on("close", () => {
      console.log(`[${sessionId}] Browser disconnected`);
      if (geminiSession) {
        geminiSession.close();
      }
    });

    browserWs.on("error", (err) => {
      console.error(`[${sessionId}] Browser WS error:`, err);
      if (geminiSession) {
        geminiSession.close();
      }
    });
  } catch (err) {
    console.error("[WS] Failed to create Gemini session:", err.message);
    browserWs.send(
      JSON.stringify({
        type: "error",
        message: "Failed to initialize Gemini session",
      })
    );
    browserWs.close();
  }
});

console.log(`🚀 WebSocket server listening on ws://localhost:${PORT}`);
console.log(`📡 Using model: ${MODEL}`);
