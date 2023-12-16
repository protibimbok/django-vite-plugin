import { defineConfig } from 'vite'
import { djangoVitePlugin } from 'django-vite-plugin'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [
        vue(),
        djangoVitePlugin({
            input:[
                'home/app.js',
            ]
        })
    ],
});
