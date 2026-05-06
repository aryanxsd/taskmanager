import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: clientRoot,
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:5000"
    }
  },
  build: {
    outDir: path.join(clientRoot, "dist"),
    emptyOutDir: true
  }
});
