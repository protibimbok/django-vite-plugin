import react from '@vitejs/plugin-react'
import { djangoVitePlugin } from 'django-vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [
        react(),
        djangoVitePlugin({
            input: ['ui/js/main.tsx'],
        }),
    ],
})
