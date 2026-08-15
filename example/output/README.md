# `output` — the `{% vite %}` tag, input & output

The flagship example: a single page that renders every form of the
`{% vite %}` tag next to the exact HTML it produced on that request.

What it demonstrates:

- **Static file lookup** — `{% vite 'home/js/app.js' %}` resolves to
  `home/static/home/js/app.js`
- **Multiple Django apps** contributing entry points (`home`, `another_app`)
- **Project-level static files** (`static/static.js`, via a prefixed
  `STATICFILES_DIRS` entry)
- **Dynamic paths and attributes** passed from the view context
- **Custom attributes**, including bare boolean attributes (`defer=True`)
- **`@s:app` import aliases** in JavaScript (`home/js/app.js` imports a module
  and a CSS file through `@s:home/...`)
- **Tailwind CSS v4** through `@tailwindcss/vite`
- **Production options** — custom `BUILD_DIR`, `BUILD_URL_PREFIX` and
  `JS_ATTRS_BUILD`, with the build served locally by
  `django_vite_plugin.urls`

## Run it

From the repository root ([setup](../README.md#quick-setup) first):

```sh
uv run pnpm dev output
```

This starts Django and Vite together (via `concurrently`). Then open
http://localhost:8000 and check the page and the browser console.

## Test the production build

```sh
uv run pnpm e:build output
DEV_MODE=False uv run example/output/manage.py runserver
```

The build lands in `build/` and is served at `/build/...` — note the hashed
file names and the extra `defer` attribute from `JS_ATTRS_BUILD`.
