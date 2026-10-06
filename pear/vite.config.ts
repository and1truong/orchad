import { defineConfig } from "vite";
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { app: "index.html", harness: "harness/index.html" },
    },
  },
  server: { host: "127.0.0.1", strictPort: true },
  appType: "spa",
});
