We stand with Palestine  against the ongoing [genocide](https://twitter.com/A_Abdelrahman0/status/1720100566368743555) and brutal [occupation](https://twitter.com/A_Abdelrahman0/status/1732448343639327122).

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/default-orange.png)](https://www.buymeacoffee.com/protibimbok)

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

## Feature Highlights

#### 1. Simple And elegant
#### 2. Static file lookup
#### 3. Auto Reload
#### 4. JS Import helpers
#### 5. Js import autocompletions
#### 6. Test for production


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
{% vite '<app_name>/<path>/<to>/<css>/styles.css' %}
```

If you want to output any additional attributes in your html, do this:
```django
{% vite '---.css' '--.js' crossorigin='anonymus' integrity='some-sha'%}
```

This will output:
```html
<link rel="stylesheet" type="text/css" crossorigin="anonymus" integrity="some-sha" href="---.css"/>
<script src="---.js" type="module" crossorigin="anonymus" integrity="some-sha"></script>
```

> Notice how &lt;script&gt; tag automatically includes type="module" attribute. You can change this behaviour from settings

Let's say you have two files your `home` app
```bash
└-- home
    └-- static
        └-- home
            |-- css
            |   └-- styles.css
            |
            └-- js
                └-- main.js
```

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
> Notice instead of using `home/static/home/*/*`, we have used `home/*/*`. By default `django_vite_plugin` adds `static/<app_name>` after first segment of the path. This behaviour can be changed from settings

#### With React
To use this with react include this in your template file
```django
<head>
    <!--Other elements-->
    {% vite 'react' %} <!-- This line -->
    {% vite 'home/css/styles.css' 'home/js/main.js' %}
</head>
```
or you may combine `react` with other inputs too
```django
<head>
    <!--Other elements-->
    {% vite 'react' 'home/css/styles.css' 'home/js/main.js' %}
</head>
```

### Vite

In your `vite.config.js` file add `django-vite-plugin`

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

Here, the argument is `string` or `array of string` that will be passed to `build.rollupOptions.input`.

> Note: Automatic addition of `static/<app_name>` is also applied here

> ***All of the entry points (used as `{% vite '...' '...' %}`) should be added here***

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
    'MANIFEST': '<BUILD_DIR>/.vite/manifest.json',
    'BUILD_URL_PREFIX': getattr(settings, 'STATIC_URL'),
    'JS_ATTRS': {
        'type': 'module'
    },
    # 'JS_ATTRS_BUILD': Not present,
    'CSS_ATTRS': {
        'rel': 'stylesheet',
        'type': 'text/css'
    },
    'STATIC_LOOKUP': True
}
```
- `WS_CLIENT` : This is the vite client script relative to the dev server url. In most of the case you don't need to change this option.(default: `@vite/client`)

- `DEV_MODE` : If set `True`, vite dev server will be used to link assets, otherwise build files. (default: `settings.DEBUG`)

- `BUILD_DIR` : The directory where vite should output the build assets. If you serve the  assets from a different server (i.e. cdn), keep the directory structure as is.(default: `settings.STATIC_ROOT` or `'static'`)

- `MANIFEST` : The path of the `manifest.json` file. The default is `<BUILD_DIR>/.vite/manifest.json` as per `Vite v5`. Even if you serve the assets from a different server, the manifest must stay in the specified location.

- `BUILD_URL_PREFIX` : **The url prefix for production.** If `DEV_MODE` is `False` then all the assets from `<BUILD_DIR>/manifest.json` would be prefixed with this value. If you serve the production build from a separate server, provide the server address here. (default: `settings.STATIC_URL`)

- `STATIC_LOOKUP` : Whether to add `static/<app_name>` after first segment of assets. `<app_name>/file` will become `<app_name>/static/<app_name>/file` (default: `True`)

- `JS_ATTRS` : Default attributes to output in all `<script>` tags (default: `{'type': 'module'}`)

- `JS_ATTRS_BUILD` : If you want your javascript attributes for production files to be different (i.e. add `defer` or `type='text/javascript'`) then add these attributes here as:
    ```python
    DJANGO_VITE_PLUGIN = {
        ...
        'JS_ATTRS_BUILD': {
            'type': 'text/javascript',
            'defer': True
        },
        ...
    }
    ```

- `CSS_ATTRS` :  Default attributes to output in all `stylesheet` tags. Default:
    ```python
    {
        'rel': 'stylesheet',
        'type': 'text/css'
    }
    ```

### Javascript
The available js configuration options are:

```typescript
{
    input: string | string[],
    root?: string,
    addAliases?: boolean,
    pyPath?: string,
    pyArgs?: string[],
    reloader?: boolean | (file: string) => boolean,
    watch?: string[],
    delay?: number,
}
```

- `input` : The js/css entry points. All of the used js/css files as `{% vite '...' '...' %}` should be added here

- `root` : The relative path from your `vite.config.js` to your project's root directory. If they are the same (which is recommended) skip it.

- `addAliases` : Whether to add the `@s:<app>` & `@t:<app>` aliases in the `jsconfig.json` file. If set `true` then will create a `jsconfig.json` if not exists. Default is it will add aliases if `jsconfig.json` file exists

- `pyPath` : The path to your python executable. (Default: `python`)

- `pyArgs` : Any additional arguments to pass in `manage.py` commands

- `reloader` : Whether to reload browser on html & py file changes.
You may pass a function to reload after checking which file has changed.
By default it checks for html & py extensions.

- `watch`: A list of additional files to watch for browser reload. By default it smartly detects the python files in your installed apps and triggers the browser reload.

- `delay`: Delay to reload after file change in milliseconds.

Let's assume your `vite.config.js` file is in `frontend` directory
```bash
|-- home
|   └-- static
|       └-- home
|           |-- css
|           |   └-- styles.css
|           |
|           └-- js
|               └-- main.js
└-- frontend
    └-- vite.config.js
```

In this case your `vite.config.js` should look like this:
```javascript
//vite.config.js
import { defineConfig } from 'vite'
import { djangoVitePlugin } from 'django-vite-plugin'

export default defineConfig({
    plugins: [
        djangoVitePlugin({
            input: [
                // Your inputs
            ],
            root: '..' // the parent directory 
        })
    ],
});
```


## Features

### 1. Simple And elegant

You don't need a whole different set of setup to start using vite. All you need to do is install the packages and add them. And you are ready to go.


### 2. Static file lookup

As per Django's recommendation, `static` files and `templates` should be inside `app_name/static/app_name` and `app_name/templates/app_name`.
When `STATIC_LOOKUP` is enabled in settings, `static/app_name` can be skipped from the import paths.

So, instead of writing
```django
{% vite 'app_name/static/app_name/path/to/asset' %}
```
You can write
```django
{% vite 'app_name/path/to/asset' %}
```
The behaviours of this setting are:

| vite argument             | Include asset path                 |
|---------------------------|------------------------------------|
| app_name/script.js        | app_name/static/app_name/script.js |
| app_name/static/script.js | app_name/static/script.js          |
| static/script.js          | static/script.js                   |

> To disable this behaviour set { `STATIC_LOOKUP` : `False` }

> ***Note:*** This uses Django's built-in staticfinder under the hood

### 3. Auto Reload

This plugin reloads your browser window whenever a relavent file is changed!

### 4. JS Import helpers

Just like STATIC_LOOKUP, helpers are available in js too. It uses vite's alias under the hood.

The default aliases are:

| Alias        | Points to                       | 
|--------------|---------------------------------|
|@             | &lt;root of the project&gt;     |
|@s:<app_name> | <app_path>/static/<app_name>    |
|@t:<app_name> | <app_path>/templates/<app_name> |

> Why alias for `templates`? Do you keep your `*.vue` files in `static` directory?

```javascript
import whatevs from '@/path/to/whatever'
// Output: import whatevs from '<project_root>/path/to/whatever'


import customAlert from '@s:ui/components/alert'
// Output: import customAlert from '<path_to_ui_app>/static/ui/components/alert'


import vueCounter from '@t:ui/vue/counter.vue'
// Output: import vueCounter from '<path_to_ui_app>/templates/ui/vue/counter.vue'
```

Setting { `STATIC_LOOKUP` : `False` } will result in 

| Alias        | Points to                   | 
|--------------|-----------------------------|
|@             | &lt;root of the project&gt; |
|@s:<app_name> | <app_path>/static           |
|@t:<app_name> | <app_path>/templates        |

### 5. Js import autocompletions
You can get autocompletions for these import aliases in the IDEs that support `jsconfig.json`

To enable this feature, add a `jsconfig.json` file in your projects root directory or in the same directory as `vite.config.js`

__Note: If you are using typescript then it will automatically add the paths there while running dev command__

### 6. Test for production

Do this to test if your build files works as expected before shipping it to the production

1. In your projects urls.py add
    ```python
    urlpatterns = [
        # some urls
        path('', include('django_vite_plugin.urls')),
        # other urls
    ]

    ```
2. In `settings.py` set
    ```python
    ...

    STATICFILES_DIRS = [
        BASE_DIR / 'build'
    ]

    ...

    DJANGO_VITE_PLUGIN = {
        # other options
        'DEV_MODE' : False,
        'BUILD_DIR': 'build'
    }
    ```
    > Replace `build` with your build directory and make sure it's different from `STATIC_ROOT` if it's set

3. If your `BUILD_URL_PREFIX` contains `http://` or `https://` comment that out.
4. Run `npm run build` to build your assets and *enjoy!*
