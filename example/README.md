# Example Projects

This directory contains example projects demonstrating various django-vite-plugin configurations.

## Quick Setup

From the project root:

```sh
python setup.py output
```

This builds the Vite plugin, installs the Django package, and sets up the example.

The script detects your package manager from lockfiles (pnpm, yarn, npm).

Options:
```sh
python setup.py --all    # Setup all examples
python setup.py --help   # Show all options
```

## Available Examples

| Example | Description |
|---------|-------------|
| `output` | Basic setup with Tailwind CSS and multiple apps |
| `react` | React integration with TypeScript |
| `multi_app` | Multiple Django apps with separate static files |
| `custom_build` | Custom build output directory configuration |
| `svelte-in-different-dir` | Svelte with Vite config in a separate frontend directory |
| `stderr` | Edge case and error handling tests |

## Manual Setup

If you prefer manual setup:

1. Install the Django package (from project root):
   ```sh
   cd django
   pip install -e .
   ```

2. Build the Vite plugin:
   ```sh
   cd vite
   pnpm install
   pnpm build
   ```

3. Install example dependencies:
   ```sh
   cd example/output
   pnpm install
   ```

4. Run the servers:
   ```sh
   # Terminal 1
   python manage.py runserver

   # Terminal 2
   pnpm dev
   ```

## For Production Testing

Each example links to the local Vite plugin for development. To test with the published package:

1. Update `package.json` to use the npm package:
   ```json
   "django-vite-plugin": "^4.1.0"
   ```

2. Run `pnpm install` (or `npm install`)

3. Build and test:
   ```sh
   pnpm build
   python manage.py runserver
   ```
