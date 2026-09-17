import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import process from "node:process";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.MUZI_PORT ?? "4317"}`,
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
