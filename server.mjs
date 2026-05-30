import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: "/vercel/share/.env.project" });

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL =
  process.env.GEMINI_LIVE_MODEL || "gemini-2.0-flash-live-001";
const PORT = process.env.WS_PORT || 8787;

if (!API_KEY) {
  console.error(
    "GEMINI_API_KEY is not set. Please add it to your environment."
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
    geminiSession = await ai.live.connect({
      model: MODEL,
      callbacks: {
        onopen: function () {
          console.log(`[${sessionId}] Gemini session opened`);
        },
        onmessage: function (msg) {
          // Forward raw Gemini messages to the browser
          try {
            // Model audio/text turn
            if (msg.serverContent?.modelTurn) {
              const parts = msg.serverContent.modelTurn.parts || [];
              for (const part of parts) {
                if (part.text) {
                  browserWs.send(
                    JSON.stringify({ type: "text", text: part.text })
                  );
                  console.log(
                    `[${sessionId}] AI text: ${part.text.substring(0, 60)}`
                  );
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

            // Output audio transcription (AI speech-to-text)
            if (msg.serverContent?.outputTranscription?.text) {
              browserWs.send(
                JSON.stringify({
                  type: "outputTranscript",
                  text: msg.serverContent.outputTranscription.text,
                })
              );
            }

            // Input audio transcription (user speech-to-text)
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
            console.error(`[${sessionId}] Error processing message:`, err);
          }
        },
        onerror: function (e) {
          console.error(`[${sessionId}] Gemini error:`, e.message);
          try {
            browserWs.send(
              JSON.stringify({ type: "error", message: e.message })
            );
          } catch (_) {}
        },
        onclose: function (e) {
          console.log(
            `[${sessionId}] Gemini session closed:`,
            e?.reason || "no reason"
          );
          try {
            browserWs.close();
          } catch (_) {}
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        inputAudioTranscription: {},
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Aoede" },
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
      },
    });

    console.log(`[${sessionId}] Gemini session connected`);

    // Notify browser that the full pipeline is ready
    browserWs.send(JSON.stringify({ type: "connected" }));

    // Handle messages from the browser
    browserWs.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "audio" && msg.data) {
          geminiSession.sendRealtimeInput({
            media: {
              mimeType: "audio/pcm;rate=16000",
              data: msg.data,
            },
          });
        } else if (msg.type === "text" && msg.text) {
          geminiSession.sendClientContent({
            turns: [{ role: "user", parts: [{ text: msg.text }] }],
          });
          console.log(
            `[${sessionId}] Forwarded text: ${msg.text.substring(0, 50)}`
          );
        }
      } catch (err) {
        console.error(`[${sessionId}] Parse error:`, err.message);
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
    console.error("[WS] Failed to create Gemini session:", err);
    try {
      browserWs.send(
        JSON.stringify({
          type: "error",
          message: "Failed to initialize Gemini session: " + err.message,
        })
      );
      browserWs.close();
    } catch (_) {}
  }
});

console.log(`WebSocket server listening on ws://localhost:${PORT}`);
console.log(`Using model: ${MODEL}`);
