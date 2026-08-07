# Django Vite Plugin

[![PyPI version](https://badge.fury.io/py/django-vite-plugin.svg)](https://badge.fury.io/py/django-vite-plugin)
[![npm version](https://img.shields.io/npm/v/django-vite-plugin)](https://www.npmjs.com/package/django-vite-plugin)
[![npm downloads](https://img.shields.io/npm/dt/django-vite-plugin)](https://www.npmjs.com/package/django-vite-plugin)
[![License](https://img.shields.io/npm/l/django-vite-plugin)](https://opensource.org/licenses/MIT)

Seamless [Vite](https://vitejs.dev) integration for Django. Get lightning-fast HMR during development and optimized builds for production.

## Installation

```sh
pip install django-vite-plugin
npm install django-vite-plugin
```

## Quick Start

### 1. Configure Django

Add the app to `INSTALLED_APPS` in `settings.py`:

```python
INSTALLED_APPS = [
    # ...
    'django_vite_plugin',
]
```

### 2. Configure Vite

Create `vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import { djangoVitePlugin } from 'django-vite-plugin'

export default defineConfig({
    plugins: [
        djangoVitePlugin([
            'myapp/js/main.js',
            'myapp/css/styles.css',
        ])
    ],
})
```

### 3. Use in Templates

```django
{% load vite %}
<!DOCTYPE html>
<html>
<head>
    {% vite %}
    {% vite 'myapp/js/main.js' 'myapp/css/styles.css' %}
</head>
<body>
    <!-- Your content -->
</body>
</html>
```

### 4. Run Development Servers

```sh
# Terminal 1
python manage.py runserver

# Terminal 2
npm run dev
```

For production, run `npm run build`.

## How It Works

### Static File Lookup

Django recommends placing static files in `app_name/static/app_name/`. This plugin simplifies paths automatically:

```django
<!-- Instead of this -->
{% vite 'myapp/static/myapp/js/main.js' %}

<!-- Write this -->
{% vite 'myapp/js/main.js' %}
```

The plugin resolves `myapp/js/main.js` to `myapp/static/myapp/js/main.js` using Django's static file finders.

| Input Path                  | Resolved Path                       |
|-----------------------------|-------------------------------------|
| `myapp/script.js`           | `myapp/static/myapp/script.js`      |
| `myapp/static/script.js`    | `myapp/static/script.js`            |
| `static/script.js`          | `static/script.js`                  |

### Import Aliases

The plugin provides convenient import aliases for JavaScript:

| Alias           | Resolves To                        |
|-----------------|------------------------------------|
| `@`             | Project root                       |
| `@s:myapp`      | `myapp/static/myapp/`              |
| `@t:myapp`      | `myapp/templates/myapp/`           |

```javascript
// Import from your app's static folder
import utils from '@s:myapp/js/utils.js'

// Import from templates (useful for React/Vue components)
import App from '@t:myapp/App.jsx'
```

Aliases are named after the app's *label*, so a nested app such as `apps.blog`
is `@s:blog`. Only apps inside `BASE_DIR` get one — installed third-party apps
are not aliased.

### Auto Reload

The browser automatically reloads when `.html` or `.py` files change. No configuration required.

## Framework Integration

### React

```django
<head>
    {% vite 'react' 'myapp/js/main.jsx' %}
</head>
```

Remember to add `@vitejs/plugin-react` to your Vite config.

### Vue / Svelte / Others

Standard Vite plugins work as expected. Add them to your `vite.config.js` alongside `djangoVitePlugin`.

## Configuration

### Django Settings

All settings are optional. Add to `settings.py`:

```python
DJANGO_VITE_PLUGIN = {
    # Use Vite dev server (default: DEBUG)
    'DEV_MODE': True,

    # Build output directory (default: STATIC_ROOT or 'static').
    # A relative path is resolved against BASE_DIR, never the working
    # directory, and Vite is given the resolved path.
    'BUILD_DIR': 'static',

    # URL prefix for built assets (default: STATIC_URL).
    # Required: set this or STATIC_URL.
    'BUILD_URL_PREFIX': '/static/',

    # Enable static file path resolution (default: True)
    'STATIC_LOOKUP': True,

    # Default attributes for script tags
    'JS_ATTRS': {
        'type': 'module',
    },
    
    # Script attributes for production builds only
    'JS_ATTRS_BUILD': {
        'type': 'module',
        'defer': True,
    },

    # Default attributes for stylesheet links
    'CSS_ATTRS': {
        'rel': 'stylesheet',
        'type': 'text/css',
    },
}
```

### Vite Options

```javascript
djangoVitePlugin({
    // Entry points (required)
    input: ['myapp/js/main.js'],

    // Project root relative to vite.config.js
    root: '..',

    // Write aliases to jsconfig.json/tsconfig.json (default: true if file exists)
    addAliases: true,

    // Python executable path
    pyPath: 'python',

    // Additional args for manage.py commands
    pyArgs: [],

    // Auto-reload on file changes (default: true)
    reloader: true,
    // Or provide a custom filter
    reloader: (file) => file.endsWith('.html'),

    // Additional files to watch
    watch: ['templates/**/*.html'],

    // Reload delay in ms (default: 3000)
    delay: 3000,
})
```

## Template Tag Reference

### Basic Usage

```django
{% load vite %}

<!-- Load Vite client (required for HMR in development) -->
{% vite %}

<!-- Load assets -->
{% vite 'myapp/js/main.js' %}
{% vite 'myapp/css/styles.css' %}

<!-- Load multiple assets -->
{% vite 'myapp/js/main.js' 'myapp/css/styles.css' %}
```

### Custom Attributes

```django
{% vite 'myapp/js/main.js' crossorigin='anonymous' data-turbo-track='reload' %}
```

Output:
```html
<script src="..." type="module" crossorigin="anonymous" data-turbo-track="reload"></script>
```

### Dynamic Paths

```django
{% vite app_name|add:'/js/main.js' %}
```

## Production Setup

### Standard Deployment

1. Run `npm run build`
2. Run `python manage.py collectstatic`
3. Set `DEBUG = False` (or explicitly set `DEV_MODE: False`)

### CDN / External Static Server

```python
DJANGO_VITE_PLUGIN = {
    'DEV_MODE': False,
    'BUILD_URL_PREFIX': 'https://cdn.example.com/static/',
}
```

The manifest file must remain accessible locally at `BUILD_DIR/.vite/manifest.json`.

### Testing Production Builds Locally

1. Add the URL pattern to `urls.py`:

    ```python
    urlpatterns = [
        # ...
        path('', include('django_vite_plugin.urls')),
    ]
    ```

2. Configure settings:

    ```python
    DEBUG = True

    STATICFILES_DIRS = [BASE_DIR / 'build']

    DJANGO_VITE_PLUGIN = {
        'DEV_MODE': False,
        'BUILD_DIR': 'build',
    }
    ```

    `DEBUG` must stay `True`. Django never serves static files with
    `DEBUG = False`, so these URL patterns are inactive in that case and the
    built assets will 404. Only `DEV_MODE` needs to be turned off to load the
    build instead of the dev server.

3. Run `npm run build` and start Django.

## Project Structure Examples

### Standard Layout

```
myproject/
├── myapp/
│   ├── static/
│   │   └── myapp/
│   │       ├── css/
│   │       │   └── styles.css
│   │       └── js/
│   │           └── main.js
│   └── templates/
│       └── myapp/
│           └── index.html
├── manage.py
├── package.json
└── vite.config.js
```

### Vite Config in Subdirectory

```
myproject/
├── myapp/
│   └── static/myapp/...
├── frontend/
│   ├── package.json
│   └── vite.config.js    # Set root: '..'
└── manage.py
```

```javascript
// frontend/vite.config.js
djangoVitePlugin({
    input: ['myapp/js/main.js'],
    root: '..',
})
```

## IDE Support

The plugin automatically updates `jsconfig.json` or `tsconfig.json` with path aliases when you run `npm run dev`. This enables autocomplete for `@s:appname` and `@t:appname` imports.

The first of `tsconfig.app.json`, `tsconfig.json` and `jsconfig.json` that exists
is the one updated. To also have a `jsconfig.json` created when the project has
none of them:

```javascript
djangoVitePlugin({
    input: [...],
    addAliases: true,
})
```

## Troubleshooting

### Assets not loading in development

- Ensure both Django and Vite dev servers are running
- Check that `DEV_MODE` is `True` (or `DEBUG = True`)
- Verify the Vite server is accessible at `http://localhost:5173`

### Build assets not found in production

- Run `npm run build` before deploying
- Ensure `BUILD_DIR` matches your Vite output directory
- Check that the manifest exists at `BUILD_DIR/.vite/manifest.json`

### Import aliases not working

- Run `npm run dev` to update `jsconfig.json`/`tsconfig.json`
- If the project has no such file, set `addAliases: true` to have one created
- Restart your IDE after alias generation

## License

MIT License. See [LICENSE](LICENSE) for details.

## Links

- [PyPI Package](https://pypi.org/project/django-vite-plugin/)
- [npm Package](https://www.npmjs.com/package/django-vite-plugin)
- [Vite Documentation](https://vitejs.dev)
- [Buy Me a Coffee](https://www.buymeacoffee.com/protibimbok) - Support the maintainer
