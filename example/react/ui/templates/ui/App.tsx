// This component lives in the app's templates/ directory to demonstrate the
// `@t:ui` alias — see ui/static/ui/js/main.tsx for the import.
import { useState } from 'react'

const styles: Record<string, React.CSSProperties> = {
    main: {
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '32rem',
        margin: '4rem auto',
        textAlign: 'center',
    },
    button: {
        fontSize: '1.25rem',
        padding: '0.5rem 1.5rem',
        cursor: 'pointer',
    },
}

export default function App() {
    const [count, setCount] = useState(0)

    return (
        <main style={styles.main}>
            <h1>Django + Vite + React</h1>
            <p>
                Served by Django, bundled by Vite. Edit this component and the
                counter below keeps its state thanks to Fast Refresh.
            </p>
            <button style={styles.button} onClick={() => setCount(count + 1)}>
                Count: {count}
            </button>
        </main>
    )
}
