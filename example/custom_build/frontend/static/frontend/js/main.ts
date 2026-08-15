const app = document.getElementById('app')!
app.innerHTML = `
    <h1>Custom build directory</h1>
    <p>
        This page's script was ${import.meta.env.DEV
            ? 'served by the Vite dev server'
            : 'built into <code>frontend/dist/</code> and served at <code>/assets/…</code>'}.
    </p>
`

console.log('[custom_build] frontend/js/main.ts is running')
