# Example Projects

This directory contains example projects demonstrating various django-vite-plugin configurations.

## Quick Setup

From the project root:

```sh
pnpm bootstrap
```

This builds the Vite plugin, installs the Django package (with uv if
available, pip otherwise), and installs dependencies for **all** examples -
they are members of the repo's pnpm workspace, so one `pnpm install` covers
everything.

## Available Examples

Each example demonstrates one aspect of the plugin and has its own README.

| Example | Description |
|---------|-------------|
| `output` | Every form of the `{% vite %}` tag next to the HTML it renders — static lookup, multiple apps, dynamic paths, Tailwind CSS |
| `react` | React 19 + TypeScript with Fast Refresh (`{% vite 'react' %}`) |
| `multi_app` | Multiple Django apps, each with its own entries, plus cross-app imports |
| `custom_build` | Custom build directory and URL prefix, `manage.py buildfrontend` |
| `svelte-in-different-dir` | Svelte 5 frontend living in its own directory next to Django |
| `stderr` | Regression check: Django warnings on stderr must not break the plugin |

## Running an Example

One terminal, from the project root (with pip, activate your environment
and drop the `uv run`):

```sh
uv run pnpm dev output
```

Each example's `dev` script uses `concurrently` to start the Django dev
server and Vite together — Django on http://localhost:8000, Vite on :5173.
Stopping it (Ctrl+C) stops both.

`pnpm dev <name>` and `pnpm e:build <name>` work for every example; leave
the name off to get a list to pick from. To run the servers separately,
use `manage.py runserver` and the example's `dev:vite` script.

## Manual Setup

If you prefer manual setup, from the project root:

```sh
# Django package (editable, with test deps)
uv sync                             # or: pip install -e "./django[test]"

# Vite plugin + all example dependencies
pnpm install
pnpm build
```

## For Production Testing

Each example links to the local Vite plugin for development. To test with the published package:

1. Update the example's `package.json` to use the npm package:
   ```json
   "django-vite-plugin": "^4.1.0"
   ```

2. Run `pnpm install`

3. Build and test (from the project root):
   ```sh
   uv run pnpm e:build output
   DEV_MODE=False uv run example/output/manage.py runserver
   ```

   Every example (except `stderr`, which is dev-only) reads the `DEV_MODE`
   environment variable in its settings, so this flow works for all of them.
