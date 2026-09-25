import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  base: "/session-cube/",
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("./dist-pages", import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./pages/index.html", import.meta.url)),
    },
  },
  root,
});
