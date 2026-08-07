# `custom_build` — custom build directory + build management command

A minimal project whose production build goes to a custom directory with a
custom URL prefix, built by a Django management command.

What it demonstrates:

- **Custom `BUILD_DIR`** — the build lands in the `frontend` app's own
  `dist/` directory (an absolute `Path` in settings)
- **Custom `BUILD_URL_PREFIX`** — built assets are served at `/assets/...`
  instead of `STATIC_URL`
- **A build management command** — `python manage.py buildfrontend` runs
  `pnpm install` and `pnpm run build`, so deployments only need Python
  tooling to trigger the frontend build

## Run it

From the repository root ([setup](../README.md#quick-setup) first):

```sh
uv run pnpm dev custom_build
```

This starts Django and Vite together (via `concurrently`). Then open
http://localhost:8000.

## Test the production build

```sh
uv run example/custom_build/manage.py buildfrontend   # or: pnpm e:build custom_build
DEV_MODE=False uv run example/custom_build/manage.py runserver
```

The build lands in `frontend/dist/` and is served at `/assets/...`.
