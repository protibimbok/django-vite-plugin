<script lang="ts">
    let count = $state(0)
</script>

<main>
    <h1>Django + Vite + Svelte</h1>
    <p>
        Served by Django from <code>templates/index.html</code>; everything
        else on this page comes from the <code>frontend/</code> directory.
    </p>
    <button onclick={() => count++}>
        Count: {count}
    </button>
    <p class="hint">
        Edit <code>frontend/src/App.svelte</code> — HMR keeps the count.
    </p>
</main>

<style>
    main {
        max-width: 32rem;
        margin: 4rem auto;
        text-align: center;
    }

    button {
        font-size: 1.25rem;
        padding: 0.5rem 1.5rem;
        cursor: pointer;
    }

    .hint {
        color: #64748b;
        font-size: 0.875rem;
    }
</style>
