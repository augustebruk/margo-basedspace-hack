import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { scribeTokenPlugin } from "./vite-plugins/scribeToken";
import { reflectionPlugin } from "./vite-plugins/reflection";
import { ttsPlugin } from "./vite-plugins/tts";

export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_-prefixed secrets) for server-side
  // use only. ELEVENLABS_API_KEY stays in the node process and is never
  // exposed to the client bundle.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      react(),
      scribeTokenPlugin(env.ELEVENLABS_API_KEY),
      reflectionPlugin(env.ANTHROPIC_API_KEY),
      ttsPlugin(env.ELEVENLABS_API_KEY, env.ELEVENLABS_VOICE_ID),
    ],
    preview: {
      // Allow access through tunnels (e.g. *.trycloudflare.com) when sharing a
      // public preview URL. Vite blocks unknown hosts by default.
      allowedHosts: true,
    },
  };
});
