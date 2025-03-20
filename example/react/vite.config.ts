import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { djangoVitePlugin } from 'django-vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    djangoVitePlugin({
      input: './ui/js/main.tsx',
      addAliases: true,
    }),
  ],
})
