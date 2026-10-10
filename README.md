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

    # Where Vite writes its manifest (default: BUILD_DIR/.vite/manifest.json).
    # A relative path is resolved against BASE_DIR. Only needed if
    # 'build.manifest' in vite.config.js names a file of its own; the plugin
    # warns during a build when the two part company.
    'MANIFEST': 'static/.vite/manifest.json',

    # URL prefix for built assets (default: STATIC_URL).
    # Set this or STATIC_URL. Required to build; dev mode never serves a
    # built asset and does not ask for one.
    'BUILD_URL_PREFIX': '/static/',

    # Enable static file path resolution (default: True)
    'STATIC_LOOKUP': True,

    # Default attributes for script tags
    'JS_ATTRS': {
        'type': 'module',
    },
    
    # Merged over JS_ATTRS for production builds only; set an attribute to
    # None to drop one of the defaults
    'JS_ATTRS_BUILD': {
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

    // Django project root (where manage.py is), relative to the directory
    // vite runs from - usually the one holding vite.config.js
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

`True` writes an attribute on its own, and `False` (or `None`) leaves it
out — which is also how you drop one of the `JS_ATTRS`/`CSS_ATTRS`
defaults, in a tag or in the settings:

```django
{% vite 'myapp/js/main.js' defer=True type=False %}
```
```html
<script defer src="..."></script>
```

HTML has no falsy attribute *value* — `defer="false"` still defers — so
leaving the attribute out is the only way to say no. Quote it if you
want the word itself: `data-x='false'`.

The attributes apply to the assets named in the tag. In a production
build, a JS entry may pull in additional `<link>` tags for the
stylesheets it imports — those always use the `CSS_ATTRS` defaults, not
the tag's attributes. To customize a stylesheet's attributes, name the
stylesheet in a `{% vite %}` tag itself.

### Dynamic Paths

```django
{% vite app_name|add:'/js/main.js' %}
```

## Production Setup

### Standard Deployment

1. Run `npm run build`
2. Run `python manage.py collectstatic`
3. Set `DEBUG = False` (or explicitly set `DEV_MODE: False`)

`BUILD_DIR` is a directory Django owns — it defaults to `STATIC_ROOT`, and it
holds hand-written assets and whatever `collectstatic` put there. So the plugin
leaves it alone rather than emptying it before a build, which is what Vite does
by default with an output directory inside its root. Old hashed files therefore
accumulate; if the directory is Vite's alone, ask for the sweep explicitly:

```javascript
export default defineConfig({
    build: { emptyOutDir: true },
    plugins: [djangoVitePlugin({ input: [...] })],
})
```

### CDN / External Static Server

```python
DJANGO_VITE_PLUGIN = {
    'DEV_MODE': False,
    'BUILD_URL_PREFIX': 'https://cdn.example.com/static/',
}
```

The manifest file must remain accessible locally at `BUILD_DIR/.vite/manifest.json`.

`BUILD_URL_PREFIX` is where Vite's `base` comes from — the plugin sets it, and a
`base` of your own in `vite.config.js` is overridden and warned about. Django
renders asset URLs from that same prefix, so the two cannot disagree.

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
    build instead of the dev server. Keeping `DEBUG` on is also what lets a
    rebuild be picked up without restarting Django: the check costs a `stat`
    per `{% vite %}` tag rendered, so it is not made in a deployment.

    Listing `BUILD_DIR` in `STATICFILES_DIRS` matters: `runserver` answers
    every URL under `STATIC_URL` itself and 404s anything the static finders
    do not know, before these patterns get a chance. If the build lives
    somewhere the finders do not look - `STATIC_ROOT`, typically - start the
    server with `runserver --nostatic` instead.

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

`root` says where `manage.py` is, and nothing else. With `STATIC_LOOKUP` on,
Vite builds and serves from `BASE_DIR` — the directory the asset names are
relative to — whatever directory you run Vite from, so the entry paths above are
the usual app-relative ones. A `root` in your Vite config is refused, with a
warning, for the same reason: the names have one directory they resolve against.

To keep Vite's root where the frontend lives, turn the lookup off and name
entries the way Vite sees them:

```javascript
// frontend/vite.config.js — Vite's root stays in frontend/
export default defineConfig({
    root: './',
    plugins: [djangoVitePlugin({ input: ['src/main.ts'], root: '..' })],
})
```

```python
DJANGO_VITE_PLUGIN = {
    'STATIC_LOOKUP': False,
}
```

See `example/svelte-in-different-dir` for the whole layout.

## IDE Support

Whenever Vite reads its config — `npm run dev` and `npm run build` alike — the
plugin writes the app aliases into your JavaScript/TypeScript config, so the IDE
resolves `@s:appname` and `@t:appname` imports the way the bundler does.

It looks in three directories: Vite's root, the directory Vite runs from, and the
Django root. Usually those are one and the same, but a frontend in a subdirectory
has a config file at each end and both of them need the aliases. In each
directory the first of `tsconfig.app.json`, `tsconfig.json` and `jsconfig.json`
that exists is the one written to. Comments, trailing commas and paths of your
own are kept, an alias you define yourself in `resolve.alias` is left to your
definition, and a file that does not parse is reported rather than overwritten.

To also have a `jsconfig.json` created when the project has none of them — it
lands at the Django root:

```javascript
djangoVitePlugin({
    input: [...],
    addAliases: true,
})
```

`addAliases: false` writes nothing at all.

## Troubleshooting

### Assets not loading in development

- Ensure both Django and Vite dev servers are running
- Check that `DEV_MODE` is `True` (or `DEBUG = True`)
- Verify the Vite server is accessible at `http://localhost:5173`
- Assets from a `STATICFILES_DIRS` entry outside `BASE_DIR` are loaded through
  Vite's `/@fs/` route, since Vite only serves what is under its root. If Vite
  answers those with *"is outside of Vite serving allow list"*, add the
  directory to [`server.fs.allow`](https://vite.dev/config/server-options#server-fs-allow)

### Assets not loading on a phone or another machine

Pointing browsers at a reachable address is only the first of three gates:

```javascript
export default defineConfig({
    server: {
        host: true,
        // Where other devices reach this machine
        hmr: { host: '192.168.1.5' },
        // Where Django serves the page; since Vite 6.0.9 anything but
        // localhost is refused by default, and the browser blocks the assets
        cors: { origin: 'http://192.168.1.5:8000' },
        // Only needed when the address above is a name rather than an IP
        allowedHosts: ['dev.example.test'],
    },
    plugins: [djangoVitePlugin({ input: [...] })],
})
```

A missing `cors` shows up as a CORS error in the browser console while Vite
logs nothing; a missing `allowedHosts` shows up as Vite's own *"Blocked
request. This host is not allowed."*

### Naming the dev server URL outright

`server.hmr.host` above changes one part of an address the plugin otherwise
works out from the socket Vite bound. To state the whole thing — behind a
reverse proxy, a tunnel, or an HTTPS terminator — set
[`server.origin`](https://vite.dev/config/server-options#server-origin):

```javascript
export default defineConfig({
    server: {
        origin: 'https://assets.example.test',
    },
    plugins: [djangoVitePlugin({ input: [...] })],
})
```

It wins over `server.hmr.host` and the bound address, and is what Django
renders in `<script src>` and `<link href>`, so the assets Vite rewrites and
the tags Django writes agree on one origin. It has to be an `http` or `https`
URL; anything else is reported and ignored.

### Build assets not found in production

- Run `npm run build` before deploying
- Ensure `BUILD_DIR` matches your Vite output directory
- Check that the manifest exists at `BUILD_DIR/.vite/manifest.json`

### Import aliases not working

- Run `npm run dev` or `npm run build` to update `jsconfig.json`/`tsconfig.json`
- If the project has no such file, set `addAliases: true` to have one created
- Restart your IDE after alias generation

## License

MIT License. See [LICENSE](LICENSE) for details.

## Links

- [PyPI Package](https://pypi.org/project/django-vite-plugin/)
- [npm Package](https://www.npmjs.com/package/django-vite-plugin)
- [Vite Documentation](https://vitejs.dev)
- [Buy Me a Coffee](https://www.buymeacoffee.com/protibimbok) - Support the maintainer
