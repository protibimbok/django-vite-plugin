# Contributing to Django Vite Plugin

Thank you for your interest in contributing! This guide will help you get started.

## Project Structure

This repo contains two packages:

```
django-vite-plugin/
├── django/                 # Python package (PyPI)
│   ├── src/
│   │   └── django_vite_plugin/
│   │       ├── templatetags/    # {% vite %} template tag
│   │       ├── management/      # CLI commands
│   │       ├── config_helper.py # Configuration handling
│   │       ├── manifest.py      # Build manifest parsing
│   │       └── utils.py         # Asset lookup and HTML tag generation
│   ├── tests/                   # pytest suite
│   └── pyproject.toml
├── vite/                   # JavaScript package (npm)
│   ├── src/
│   │   ├── index.ts        # Plugin entry point
│   │   ├── config.ts       # Configuration resolution
│   │   └── helpers.ts      # Utility functions
│   ├── tests/              # node:test suite
│   └── package.json
└── example/                # Example projects
    ├── output/             # Basic example with Tailwind
    ├── react/              # React integration
    ├── multi_app/          # Multiple Django apps
    ├── custom_build/       # Custom build directory
    ├── svelte-in-different-dir/  # Svelte with separate frontend
    └── stderr/             # Edge case testing
```

## Development Setup

### Prerequisites

- Python 3.9+
- Node.js 14+
- pnpm (recommended) or npm

### Initial Setup

1. Clone the repository:

    ```sh
    git clone https://github.com/protibimbok/django-vite-plugin.git
    cd django-vite-plugin
    ```

2. Set up the Python package (editable install):

    ```sh
    cd django
    pip install -e .
    cd ..
    ```

3. Set up the Vite plugin:

    ```sh
    cd vite
    pnpm install
    pnpm build
    cd ..
    ```

4. Set up an example project:

    ```sh
    cd example/output
    pnpm install
    cd ../..
    ```

### Using the Setup Script

```sh
python setup.py output
```

This will:
1. Build the Vite plugin
2. Install the Django package (editable)
3. Install dependencies for the example

The script auto-detects:
- **Python installer**: uv (preferred) or pip
- **JS package manager**: from lockfiles, or pnpm > yarn > npm

Options:
```sh
python setup.py --all         # Setup all examples
python setup.py --vite-only   # Only build Vite plugin
python setup.py --django-only # Only install Django package
python setup.py --skip-core   # Skip core, only setup example
```

Available examples: `output`, `react`, `multi_app`, `custom_build`, `svelte-in-different-dir`, `stderr`

## Development Workflow

### Working on the Vite Plugin (JavaScript)

```sh
cd vite

# Build once
pnpm build

# Watch mode (rebuild on changes)
pnpm build --watch
```

The example projects link to the local `vite/` directory, so changes are reflected after rebuilding.

### Working on the Django Package (Python)

With the editable install (`pip install -e .`), Python changes take effect immediately without reinstalling.

### Testing Changes

1. Start an example project:

    ```sh
    cd example/output
    
    # Terminal 1: Django
    python manage.py runserver
    
    # Terminal 2: Vite
    pnpm dev
    ```

2. Open `http://localhost:8000` in your browser

3. Make changes and verify they work as expected

## Code Style

### Python

- Follow PEP 8
- Use type hints where practical
- Keep functions focused and well-documented

### TypeScript

- Run `pnpm lint` before committing
- Use explicit types for public APIs
- Format with Prettier (`pnpm format` if available)

## Testing

Both packages have a test suite, and both run in CI on every push and pull
request. A release cannot publish unless they pass.

### Django package

```sh
cd django
pip install -e ".[test]"
pytest
```

The suite needs no database and no example project: it configures Django
itself and builds whatever project layout a test needs in a temporary
directory. Because the plugin reads settings at *import* time, tests ask the
`plugin` fixture for a fresh copy of the package under the settings they care
about - see `django/tests/conftest.py`.

### Vite plugin

```sh
cd vite
pnpm test          # builds first, then runs the suite
```

The tests drive the real plugin against real Vite dev servers and builds. They
talk to a stub `manage.py` (`vite/tests/fixtures/manage.py`) that speaks the
plugin's JSON protocol, so no Django install is needed - but a `python3` on
PATH is. `smoke.test.mjs` loads the built package through both entry points of
its `exports` map, which is the check that a published artifact is loadable at
all.

### Manual Testing

Each example project tests different scenarios:

| Example | Tests |
|---------|-------|
| `output` | Basic setup, Tailwind CSS, multiple apps |
| `react` | React integration with JSX/TSX |
| `multi_app` | Multiple Django apps with separate static files |
| `custom_build` | Custom build output directory |
| `svelte-in-different-dir` | Vite config in separate directory |
| `stderr` | Error handling and edge cases |

When making changes, test with relevant example projects.

### Build Testing

```sh
# Build Vite plugin
cd vite && pnpm build

# Test production build in example
cd ../example/output
pnpm build
DEV_MODE=False python manage.py runserver
```

## Making Changes

### Adding a New Feature

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Implement the feature in the appropriate package
3. Update configuration types if needed (both Python and TypeScript)
4. Add/update example projects to demonstrate the feature
5. Update documentation in the main README
6. Submit a pull request

### Fixing a Bug

1. Create a bug fix branch: `git checkout -b fix/issue-description`
2. Add a failing test to `django/tests/` or `vite/tests/` that reproduces it
3. Implement the fix
4. Check the new test passes and the rest of the suite still does
5. Submit a pull request referencing the issue

### Updating Dependencies

- Python dependencies: Update `pyproject.toml` in `django/`
- JavaScript dependencies: Update `package.json` in `vite/`
- Run full test suite after dependency updates

## Release Process

Releases are automated via GitHub Actions:

- **PyPI**: Triggered by tags matching `v*` (publishes `django/`)
- **npm**: Triggered by tags matching `v*` (publishes `vite/`)

### Version Bumping

Both packages should have matching versions. Update:

1. `django/pyproject.toml` - `version` field
2. `vite/package.json` - `version` field

## Communication Between Packages

The Vite plugin communicates with Django via a management command:

```
vite plugin  -->  python manage.py django_vite_plugin --action config
                  (returns JSON with app paths, settings, etc.)
```

This allows the Vite plugin to:
- Discover Django app locations
- Read `DJANGO_VITE_PLUGIN` settings
- Resolve static file paths

Changes to this interface require updates in both packages.

## Architecture Notes

### Hot File

During development, Vite writes the dev server URL to a "hot file" (default: `.hotfile`). Django reads this file to determine whether to serve assets from Vite or use built files.

### Static Lookup

The `STATIC_LOOKUP` feature uses Django's `staticfiles.finders` to resolve shortened paths to full static file paths. This happens in both:
- Python: When rendering `{% vite %}` tags
- JavaScript: When resolving Vite entry points

### Manifest

In production, Vite generates `.vite/manifest.json` mapping original filenames to hashed output files. The Django package reads this manifest to generate correct asset URLs.

## Getting Help

- Open an issue for bugs or feature requests
- Check existing issues and PRs before creating new ones
- For questions, use GitHub Discussions if available

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
