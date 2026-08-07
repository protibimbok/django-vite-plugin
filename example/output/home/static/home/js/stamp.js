export function renderStamp() {
    const stamp = document.getElementById('stamp')
    if (stamp) {
        stamp.textContent =
            'Rendered by home/js/app.js — its import of imported.css styles this line.'
        stamp.classList.add('stamp')
    }
}
