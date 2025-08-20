// vitest.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  server: {
    host: true,         // permite acesso via LAN se precisar
    port: 5173          // opcional (padrão do Vite)
  },
  test: {
    include: ['**/*.test.{js,jsx,ts,tsx}'],
    exclude: [
      'test/integration/**',
      'test/integraation/**',
      'hardhat.config.*',
      'scripts/**',
      'node_modules/**',
    ],
    environment: 'node',
    passWithNoTests: false,
  }
});
