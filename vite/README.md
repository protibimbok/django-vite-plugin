# Django Vite Plugin

[![npm version](https://img.shields.io/npm/v/django-vite-plugin)](https://www.npmjs.com/package/django-vite-plugin)
[![npm downloads](https://img.shields.io/npm/dt/django-vite-plugin)](https://www.npmjs.com/package/django-vite-plugin)
[![Licence](https://img.shields.io/npm/l/django-vite-plugin)](https://www.npmjs.com/package/django-vite-plugin)

## Introduction

[Vite](https://vitejs.dev) is a modern frontend build tool that provides an extremely fast development environment and bundles your code for production.

This plugin configures Vite for use with Django backend.

## Installation
```sh
# Install django app (this is required)
pip install django_vite_plugin

# Install vite plugin
npm install django-vite-plugin
```


## Usage

```javascript
//vite.config.js
import { defineConfig } from 'vite'
import { djangoVitePlugin } from 'django-vite-plugin'

export default defineConfig({
    plugins: [
        djangoVitePlugin([
            'home/js/app.js',
            'home/css/style.css',
        ])
    ],
});

```
__See the official documentation for more details__

## Official Documentation

Documentation for the Django Vite plugin can be found on the [Github](https://github.com/protibimbok/django-vite-plugin).

## License

The Django Vite plugin is open-sourced software licensed under the [MIT license](LICENSE.md).
