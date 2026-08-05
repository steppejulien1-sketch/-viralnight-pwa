import { defineConfig } from "vite";

// SPA : une seule entree (index.html), le routing est gere en JS
// (src/lib/router.js). Pas de multi-page ici, contrairement au site B2B.
export default defineConfig({
  server: { host: "127.0.0.1", port: 5174 },
  build: {
    target: "es2020",
    cssMinify: true,
  },
});
