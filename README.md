# Django Vite Plugin

[![PyPI version](https://badge.fury.io/py/django-vite-plugin.svg)](https://badge.fury.io/py/django-vite-plugin)


[![npm version](https://img.shields.io/npm/v/django-vite-plugin)](https://www.npmjs.com/package/django-vite-plugin)
[![npm downloads](https://img.shields.io/npm/dt/django-vite-plugin)](https://www.npmjs.com/package/django-vite-plugin)
[![Licence](https://img.shields.io/npm/l/django-vite-plugin)](https://www.npmjs.com/package/django-vite-plugin)

## Introduction

[Vite](https://vitejs.dev) is a modern frontend build tool that provides an extremely fast development environment and bundles your code for production.

This plugin configures Vite for use with Django backend.

## Installation

```sh
# Install django app
pip install django_vite_plugin

# Install vite plugin
npm install django-vite-plugin
```

## Usage


### Django

In your project's `settings.py` file, add `django_vite_plugin` in installed apps list

```python
# Some settings
INSTALLED_APPS = [
    # Some apps
    'django_vite_plugin',
    # Other apps
]
```

Now use the following code in your template files to load the assets

```django
{% vite '<app_name>/<dir>.../file.css' '<app_name>/<dir>.../file.js' %}
```

If you want to output any additional attributes in your html, do this:
```django
{% vite 'home/static/css/styles.css' 'home/static/js/app.js' crossorigin='anonymus' integrity='some-sha'%}
```

This will output:
```html
<link rel="stylesheet" crossorigin="anonymus" integrity="some-sha" href="home/static/css/styles.css"/>
<script src="home/static/js/app.js" type="module" crossorigin="anonymus" integrity="some-sha"></script>
```

> Notice how &lt;script&gt; tag automatically includes type="module" attribute. You can change this behaviour from settings

Let's say you have two files your `home` app
- home/static -
   - css/styles.css
   - js/main.js
- manage.py
- ...

To include these files your Template file would look like:

```django
{% load vite %}
<!DOCTYPE html>
<html lang="en">
    <head>
        <!--Other elements-->
        <!--Vite dev client for hmr (will not be displayed on production)-->
        {% vite %}
        {% vite 'home/css/styles.css' 'home/js/main.js' %}
    </head>
    <body>
        <!--Page content-->
    </body>
</html>
```
> Notice instead of using `home/static/*/*`, we have used `home/*/*`. By default `django_vite_plugin` adds `static` after first segment of the path. This behaviour can be changed from settings

### Vite

In your `vite.config.js` file add `django-vite-plugin`

```javascript
//vite.config.js
import { defineConfig } from 'vite'
import djangoVite from 'django-vite-plugin'

export default defineConfig({
    plugins: [
        djangoVite([
            'home/js/app.js',
            'home/css/style.css',
        ])
    ],
});
```

Here, the argument is `string` or `array of string` that will be passed to `build.rollupOptions.input`.

> Note: Automatic addition of `static` is also applied here

Then run the following commands in two separate terminal

```sh
# Start the django development server
python manage.py runserver

# Start the vite dev server
npm run dev
```

And to build the assets for production, run

```sh
npm run build
```

## Configuration

`django_vite_plugin` requires ***`zero configuartion`*** to develop or build your project. However, there are things you can customize

All the customizations are to be done in your `settings.py` file



The default configurations are:


```python
DJANGO_VITE_PLUGIN = {
    'WS_CLIENT': '@vite/client',
    'DEV_MODE': getattr(settings, 'DEBUG', True),
    'BUILD_DIR': getattr(settings, 'STATIC_ROOT') or 'static',
    'BUILD_URL_PREFIX': getattr(settings, 'STATIC_URL'),
    'SERVER': {
        'HTTPS': False,
        'HOST': 'localhost',
        'PORT': 5173
    },
    'JS_ATTRS': {
        'type': 'module'
    },
    'CSS_ATTRS': {
        'rel': 'stylesheet'
    },
    'STATIC_LOOKUP': True
}
```
- `WS_CLIENT` : This is the vite client script relative to the dev server url. In most of the case you don't need to change this option.(default: `@vite/client`)

- `DEV_MODE` : If set `True`, vite dev server will be used to link assets, otherwise build files. (default: `settings.DEBUG`)

- `BUILD_DIR` : The directory where vite should output the build assets and from where files would be served. If you serve the files from a separate server, keep the `manifest.json` file of this directory as is.(default: `settings.STATIC_ROOT` or `'static'`)

- `BUILD_URL_PREFIX` : The url prefix for production. If `DEV_MODE` is `False` then all the assets from `<BUILD_DIR>/manifest.json` would be prefixed with this value. If you serve the production build from a separate server, provide the server address here. (default: `settings.STATIC_URL`)

- `STATIC_LOOKUP` : Whether to add `static` after first segment of assets. `<app_name>/file` will become `<app_name>/static/file` (default: `True`)

- `JS_ATTRS` : Default attributes to output in all `<script>` tags (default: `{'type': 'module'}`)

- `CSS_ATTRS` :  Default attributes to output in all `stylesheet` tags (default: `{'rel': 'stylesheet'}`)

- `SERVER`: The configuration for vite dev server is provided here
    - `HTTPS`: Whether to use secure http connection. If you want to enable https, provide ssl `key` & `cert` here as `{'CERT': '<certificate.cert>', 'KEY':'<ssl_key>'}` (default: `False`)

    - `HOST` : Vite dev server host (default: `localhost`)

    - `PORT` : Vite dev server port (default: `5173`)
