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

In your projects `settings.py` file, add `django_vite_plugin` in installed apps list


```python
# Some settings
INSTALLED_APPS = [
    # Some apps
    'django_vite_plugin',
    # Other apps
]
```


And then add `django-vite-plugin` in your `vite.config.js` file

```javascript
//vite.config.js
import { defineConfig } from 'vite'
import djangoVite from 'django-vite-plugin'

export default defineConfig({
    plugins: [
        djangoVite([
            'home/js/app.js', // You can omit `static` from your asset paths
            'home/css/style.css',
        ])
    ],
});
```

And in your Template file
```html
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

Then run the following commands in two separate terminal

```sh
# Start the django development server
python manage.py runserver

# Start the vite dev server
npm run dev
```
***And enjoy!***