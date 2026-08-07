// Referenced from the view context, not hardcoded in any template.
const note = document.getElementById('dynamic-note')
if (note) {
    note.textContent =
        'static/dynamic.js ran — this path reached {% vite %} through the view context.'
    note.classList.add('dynamic-note')
}
