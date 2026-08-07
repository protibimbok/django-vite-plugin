import { djangoVitePlugin } from 'django-vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [
        djangoVitePlugin({
            input: ['frontend/js/main.ts'],
        }),
    ],
})
