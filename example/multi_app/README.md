# `multi_app` — multiple Django apps, each with its own assets

Two apps (`blog` and `dashboard`) that each own a page, an entry point and
their static files, plus shared code imported across app boundaries.

What it demonstrates:

- **Per-app entry points** — each app's template loads its own
  `{% vite '<app>/js/main.ts' %}`, resolved through the static file lookup to
  `<app>/static/<app>/js/main.ts`
- **A per-app CSS entry** (`blog/css/main.css`)
- **Cross-app imports** — the dashboard imports the blog's data module via
  the auto-generated `@s:blog` alias
- **Project-level shared code** — both apps import `static/js/format.ts`
  through the `@` alias (project root)
- **A shared base template** with the Vite client loaded once

## Run it

From the repository root ([setup](../README.md#quick-setup) first):

```sh
uv run pnpm dev multi_app
```

This starts Django and Vite together (via `concurrently`). Then open
http://localhost:8000 (blog) and http://localhost:8000/dashboard/.

## Test the production build

```sh
uv run pnpm e:build multi_app
DEV_MODE=False uv run example/multi_app/manage.py runserver
```
