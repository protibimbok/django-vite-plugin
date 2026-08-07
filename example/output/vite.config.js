import tailwindcss from '@tailwindcss/vite'
import { djangoVitePlugin } from 'django-vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [
        tailwindcss(),
        djangoVitePlugin([
            'home/js/app.js',
            'home/css/main.css',
            'another_app/js/one.js',
            'static/static.js',
            'static/dynamic.js',
            'static/dynamic.css',
        ]),
    ],
})
