import { resolve } from "node:path";
import { defineConfig } from "vite";

// Deux fronts, un seul projet, une seule base Supabase :
//   index.html  -> PWA client (mobile-first)
//   owner.html  -> Dashboard propriétaire (desktop-first)
export default defineConfig({
  server: { host: "127.0.0.1", port: 5174 },
  build: {
    target: "es2020",
    cssMinify: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        owner: resolve(__dirname, "owner.html"),
      },
    },
  },
});
