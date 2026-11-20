import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

declare const process: { env: Record<string, string | undefined> }; // senza @types/node

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      // STATISFY_API: backend alternativo (es. uno di prova su un'altra porta); predefinito 127.0.0.1:8000
      "/api": { target: process.env.STATISFY_API || "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
