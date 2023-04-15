import { defineConfig } from 'vite'
import djangoVite from '../django-vite-plugin/index.js'
import vue from '@vitejs/plugin-vue'
import glob from 'glob'

export default defineConfig({
    plugins: [
        vue(),
        djangoVite({
            input:[
                'home/js/app.js',
                'home/css/tailwind.css',

                //index.html
                'another_app/js/one.js',
                ...glob.sync('static/**/*.{js,css}'),
            ],
            root: '../'
        })
    ],
});
