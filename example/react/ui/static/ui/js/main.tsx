import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// `@t:ui` is an auto-generated alias for `ui/templates/ui` — components can
// live next to the templates that mount them.
import App from '@t:ui/App'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
