# `react` — React + TypeScript integration

A React 19 counter rendered into a Django template.

What it demonstrates:

- **`{% vite 'react' %}`** — the special `'react'` argument injects the React
  Fast Refresh preamble in dev mode (and renders nothing in a build). It must
  come before the entry that uses React.
- **`@vitejs/plugin-react`** working alongside `djangoVitePlugin`
- **`@t:app` import aliases** — the entry point lives in `ui/static/ui/`,
  while the `App` component lives in `ui/templates/ui/` and is imported as
  `@t:ui/App` (the plugin writes the aliases into `tsconfig.json` so the IDE
  understands them too)

## Run it

From the repository root ([setup](../README.md#quick-setup) first):

```sh
uv run pnpm dev react
```

This starts Django and Vite together (via `concurrently`). Then open
http://localhost:8000 — edit `ui/templates/ui/App.tsx` and watch Fast
Refresh keep the counter state.

## Test the production build

```sh
uv run pnpm e:build react
DEV_MODE=False uv run example/react/manage.py runserver
```
