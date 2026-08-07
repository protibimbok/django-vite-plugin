import { djangoVitePlugin } from 'django-vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [
        djangoVitePlugin([
            'home/js/main.js',
        ]),
    ],
})
