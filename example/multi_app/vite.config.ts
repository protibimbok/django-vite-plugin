import { djangoVitePlugin } from 'django-vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [
        djangoVitePlugin([
            'blog/js/main.ts',
            'blog/css/main.css',
            'dashboard/js/main.ts',
        ]),
    ],
})
