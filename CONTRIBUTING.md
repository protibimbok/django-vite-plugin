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
├── example/                # Example projects
│   ├── output/             # Basic example with Tailwind
│   ├── react/              # React integration
│   ├── multi_app/          # Multiple Django apps
│   ├── custom_build/       # Custom build directory
│   ├── svelte-in-different-dir/  # Svelte with separate frontend
│   └── stderr/             # Edge case testing
├── script/                 # Repo tooling (setup.ts bootstraps, example.ts runs examples)
├── pyproject.toml          # uv workspace + root pytest config
├── package.json            # root scripts (bootstrap, build, test, lint, dev, e:build)
└── pnpm-workspace.yaml     # pnpm workspace (plugin + examples)
```

## Development Setup

Everything runs from the repository root - no cd-ing into `django/`, `vite/`,
or `example/` required. The JS side is a single pnpm workspace
(`pnpm-workspace.yaml`) covering the plugin and every example; the Python side
is a uv workspace (`pyproject.toml`) around the `django/` package, and works
equally well with plain pip.

### Prerequisites

- Python 3.9+ (with uv or pip)
- Node.js 22+ (the build uses `--experimental-strip-types`)
- pnpm

### Initial Setup

1. Clone the repository:

    ```sh
    git clone https://github.com/protibimbok/django-vite-plugin.git
    cd django-vite-plugin
    ```

2. Run the setup script:

    ```sh
    pnpm bootstrap
    ```

    This installs the whole JS workspace (plugin + all examples), builds the
    Vite plugin, and installs the Django package editable with its test
    dependencies - using uv if available, pip otherwise.

    Or do the same by hand:

    ```sh
    pnpm install && pnpm build

    # with uv (creates ./.venv):
    uv sync

    # or with pip (into your active environment):
    pip install -e "./django[test]"
    ```

Options:
```sh
pnpm bootstrap --js-only   # Only pnpm install + build the Vite plugin
pnpm bootstrap --py-only   # Only install the Django package
```

## Development Workflow

### Working on the Vite Plugin (JavaScript)

```sh
# Build once
pnpm build

# Watch mode (rebuild on changes)
pnpm --filter django-vite-plugin build --watch
```

The example projects link to the local `vite/` directory, so changes are reflected after rebuilding.

### Working on the Django Package (Python)

With the editable install, Python changes take effect immediately without reinstalling.

### Testing Changes

1. Start an example project (two terminals, both from the repo root):

    ```sh
    # Terminal 1: Django
    uv run example/output/manage.py runserver   # or: python example/output/manage.py runserver

    # Terminal 2: Vite
    uv run pnpm dev output
    ```

    (`uv run` puts the workspace `.venv` on PATH so the Vite plugin finds a
    Python that has Django installed. With pip, activate your environment
    instead.)

    `pnpm dev` and `pnpm e:build` work for every example; leave the name
    off to get a list to pick from.

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
uv run pytest      # or, with pip: pip install -e "./django[test]" && pytest
```

The suite needs no database and no example project: it configures Django
itself and builds whatever project layout a test needs in a temporary
directory. Because the plugin reads settings at *import* time, tests ask the
`plugin` fixture for a fresh copy of the package under the settings they care
about - see `django/tests/conftest.py`.

### Vite plugin

```sh
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
pnpm build

# Test production build in example
uv run pnpm e:build output
DEV_MODE=False uv run example/output/manage.py runserver
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
