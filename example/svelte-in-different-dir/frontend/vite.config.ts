import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { djangoVitePlugin } from "django-vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  root: "./", // This is the root of the frontend assets
  build: {
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        assetFileNames: "[name]/main.[ext]",
        chunkFileNames: "[name]/main.js",
        entryFileNames: "[name]/main.js",
      },
    },
  },
  plugins: [
    svelte(),
    djangoVitePlugin({
      input: ["./src/main.ts"],
      root: "../project", // This is the root of the django project
    }),
  ],
});
