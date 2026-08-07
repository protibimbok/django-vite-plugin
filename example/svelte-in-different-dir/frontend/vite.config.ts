import { svelte } from '@sveltejs/vite-plugin-svelte'
import { djangoVitePlugin } from 'django-vite-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
    // Vite's own root stays here, where the frontend sources live.
    root: './',
    build: {
        // BUILD_DIR is outside this directory; let Vite clean it anyway.
        emptyOutDir: true,
    },
    plugins: [
        svelte(),
        djangoVitePlugin({
            input: ['src/main.ts'],
            // ...but manage.py lives one directory up.
            root: '..',
        }),
    ],
})
