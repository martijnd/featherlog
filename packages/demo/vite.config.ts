import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      // Allow Vite to access files outside the demo package
      allow: [".."],
    },
  },
  resolve: {
    alias: {
      // Point to SDK entry point - Vite will process TypeScript on the fly
      featherlog: path.resolve(__dirname, "../sdk/index.ts"),
    },
  },
  optimizeDeps: {
    // Exclude featherlog from optimization to ensure it uses the latest code
    exclude: ["featherlog"],
  },
  define: {
    // Ensure NODE_ENV is set to "development" in dev mode
    // This helps the SDK detect the correct environment
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development"
    ),
  },
});
