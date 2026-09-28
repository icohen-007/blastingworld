import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // Isaac'sFLIX / AI Social Media Gen Content — Kie image API
      "/kie-api": {
        target: "http://127.0.0.1:8101",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kie-api/, ""),
      },
    },
  },
});
