import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: {
    // Allow access through tunnels (e.g. *.trycloudflare.com) when sharing a
    // public preview URL. Vite blocks unknown hosts by default.
    allowedHosts: true,
  },
});
