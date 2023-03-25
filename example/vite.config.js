import { defineConfig } from 'vite'
import djangoVite from './django-vite-plugin/index.js'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [
        vue(),
        djangoVite({
            input:[
                'home/js/app.js',
                'home/css/tailwind.css',
            ]
        })
    ],
});
