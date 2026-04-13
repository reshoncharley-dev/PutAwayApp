import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  optimizeDeps: { exclude: ["@electric-sql/pglite"] },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
