import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  resolve: {
    alias: {
      featherlog: path.resolve(__dirname, "../sdk/dist/index.js"),
    },
  },
  optimizeDeps: {
    include: ["featherlog"],
  },
});
