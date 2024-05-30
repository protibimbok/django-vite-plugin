import { defineConfig } from "vite";
import { djangoVitePlugin } from "django-vite-plugin";


export default defineConfig({
    plugins: [djangoVitePlugin({
        input: ["static/js/main.ts"]
    })]
});