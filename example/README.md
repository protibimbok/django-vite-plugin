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

| Example | Description |
|---------|-------------|
| `output` | Basic setup with Tailwind CSS and multiple apps |
| `react` | React integration with TypeScript |
| `multi_app` | Multiple Django apps with separate static files |
| `custom_build` | Custom build output directory configuration |
| `svelte-in-different-dir` | Svelte with Vite config in a separate frontend directory |
| `stderr` | Edge case and error handling tests |

## Running an Example

Two terminals, both from the project root (with pip, activate your
environment and use `python` instead of `uv run`):

```sh
# Terminal 1 - Django
uv run example/output/manage.py runserver

# Terminal 2 - Vite
uv run pnpm dev output
```

`pnpm dev <name>` and `pnpm e:build <name>` work for every example; leave
the name off to get a list to pick from.

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
