import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  base: "./",
  server: { allowedHosts: ["terminal.local"] },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        viewer: resolve(__dirname, "viewer.html"),
      },
    },
  },
});

