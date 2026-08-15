// Cross-app import: `@s:blog` points at blog/static/blog.
import { posts } from '@s:blog/js/data'
import { formatDate } from '@/static/js/format'

const latest = posts[posts.length - 1]
document.getElementById('summary')!.textContent =
    `The blog app has ${posts.length} posts; ` +
    `the latest was published ${formatDate(latest.published)}.`

console.log('[multi_app] dashboard/js/main.ts is running')
