import { defineConfig } from 'vite'
import { djangoVitePlugin } from 'django-vite-plugin'
import vue from '@vitejs/plugin-vue'
import glob from 'glob'

export default defineConfig({
    plugins: [
        vue(),
        djangoVitePlugin({
            input:[
                'home/js/app.js',
                'home/css/tailwind.css',

                //index.html
                'another_app/js/one.js',
                ...glob.sync('static/**/*.{js,css}'),
            ]
        })
    ],
});
