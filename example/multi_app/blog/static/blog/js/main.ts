// `@s:blog` is this app's own static dir; `@` is the project root.
import { posts } from '@s:blog/js/data'
import { formatDate } from '@/static/js/format'

const list = document.getElementById('posts')!
for (const post of posts) {
    const item = document.createElement('li')
    item.textContent = `${post.title} — ${formatDate(post.published)}`
    list.appendChild(item)
}

console.log('[multi_app] blog/js/main.ts is running')
