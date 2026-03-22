// =============================================================================
// vite.config.js
//
// Proxies all /api/* requests from the Vite dev server (localhost:5173)
// to the FastAPI server (localhost:8000).
//
// This means you can write fetch("/api/audit") in React code and it will
// reach FastAPI without any CORS issues during development.
//
// Run both servers at the same time:
//   Terminal 1:  cd server && uvicorn main:app --reload --port 8000
//   Terminal 2:  cd client && npm run dev
// =============================================================================

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
