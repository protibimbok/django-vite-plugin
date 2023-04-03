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
These are the available configuration options
```pyhton
# Other settings
DJANGO_VITE_PLUGIN = {
    'WS_CLIENT': '@vite/client',
    'DEV_MODE': getattr(settings, 'DEBUG', True),
    'BUILD_DIR': getattr(settings, 'STATIC_ROOT') or 'static',
    'BUILD_URL_PREFIX': getattr(settings, 'STATIC_URL'), # Bundled assets would be prefixed with this on production
    'SERVER': {
        'HTTPS': False,
        'HOST': '127.0.0.1',
        'PORT': 5173
    },
    'JS_ATTRS': {
        'type': 'module'
    },
    'CSS_ATTRS': {
        'rel' : 'stylesheet',
        'type': 'text/css'
    },
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
