# `svelte-in-different-dir` — a standalone frontend directory

A Svelte 5 single-page app whose entire Vite project (config, sources,
`node_modules`) lives in its own `frontend/` directory next to a plain
Django project.

What it demonstrates:

- **Two roots** — Vite's `root` stays `frontend/` (where the sources are),
  while the plugin's `root: '..'` option points at the directory that holds
  `manage.py`
- **`STATIC_LOOKUP: False`** — entries are addressed exactly as Vite sees
  them (`{% vite 'src/main.ts' %}`), with no Django app path rewriting
- **An absolute `BUILD_DIR`** — required when the Vite root is not the
  Django root, so both sides agree on where the build lands
- **Svelte + `vitePreprocess`** alongside `djangoVitePlugin`

## Run it

From the repository root ([setup](../README.md#quick-setup) first):

```sh
uv run pnpm dev svelte-in-different-dir
```

This starts Django and Vite together (via `concurrently`). Then open
http://localhost:8000.

## Test the production build

```sh
uv run pnpm e:build svelte-in-different-dir
DEV_MODE=False uv run example/svelte-in-different-dir/manage.py runserver
```
