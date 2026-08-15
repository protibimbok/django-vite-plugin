# Django Vite Plugin

[![PyPI version](https://badge.fury.io/py/django-vite-plugin.svg)](https://badge.fury.io/py/django-vite-plugin)

## Introduction

[Vite](https://vitejs.dev) is a modern frontend build tool that provides an extremely fast development environment and bundles your code for production.

This plugin configures Vite for use with Django backend.

## Installation
```sh
pip install django_vite_plugin
```

Then in your projects `settings.py` file, add `django_vite_plugin` in installed apps
```python
# Some settings
INSTALLED_APPS = [
    # Some apps
    'django_vite_plugin',
    # Other apps
]
```
These are the available configuration options, shown with their defaults
```python
# Other settings
DJANGO_VITE_PLUGIN = {
    # Load assets from the Vite dev server instead of a build
    'DEV_MODE': DEBUG,
    # Where Vite builds to. A relative path is resolved against BASE_DIR
    'BUILD_DIR': STATIC_ROOT or 'static',
    # Where Vite writes its manifest, resolved against BASE_DIR
    'MANIFEST': None,  # -> BUILD_DIR/.vite/manifest.json
    # Bundled assets are prefixed with this on production
    'BUILD_URL_PREFIX': STATIC_URL,
    # Where Vite writes the URL it is running at, resolved against BASE_DIR.
    # The dev server address itself is Vite's to choose - set `server.host`
    # and `server.port` in vite.config.js, not here
    'HOT_FILE': None,  # -> BASE_DIR/.hotfile
    'WS_CLIENT': '@vite/client',
    'JS_ATTRS': {
        'type': 'module'
    },
    # Unset by default; when given, replaces JS_ATTRS entirely if DEV_MODE is off
    # 'JS_ATTRS_BUILD': {'type': 'module', 'defer': True},
    'CSS_ATTRS': {
        'rel' : 'stylesheet',
        'type': 'text/css'
    },
    # Resolve asset paths through Django's static file finders
    'STATIC_LOOKUP': True
}
```
__See the official documentation for more details__

## Usage

```html
<!--Your Template file-->
{% load vite %}
<!DOCTYPE html>
<html lang="en">
    <head>
        <!--Other elements-->
        <!--Vite dev client for hmr (will not be displayed on production)-->
        {% vite %}
        <!--These attributes will be present in both `asset1.css` & `asset2.js`-->
        {% vite 'asset1.css' 'asset2.js' someattr='value' %}
    </head>
    <body>
        <!--Page content-->
    </body>
</html>
```

## Official Documentation

Documentation for the Django Vite plugin can be found on the [Github](https://github.com/protibimbok/django-vite-plugin).

## License

The Django Vite plugin is open-sourced software licensed under the [MIT license](LICENSE.md).
