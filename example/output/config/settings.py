"""
Settings for the `output` example.

Deliberately minimal — only what a Django + Vite page needs. The
plugin-specific part is the DJANGO_VITE_PLUGIN dict at the bottom.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-example-key-not-for-production'

DEBUG = True

ALLOWED_HOSTS = []

INSTALLED_APPS = [
    'django.contrib.staticfiles',
    'django_vite_plugin',
    'home',
    'another_app',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {},
    },
]

STATIC_URL = 'static/'

# The prefixed entry makes the project-level static/ directory resolvable by
# the static file finders, so {% vite 'static/static.js' %} is found the same
# way app assets are.
STATICFILES_DIRS = [
    ('static', BASE_DIR / 'static'),
]

DJANGO_VITE_PLUGIN = {
    # `DEV_MODE=False python manage.py runserver` serves the production build
    # made by `pnpm e:build output` instead of using the Vite dev server.
    'DEV_MODE': os.environ.get('DEV_MODE', 'True').lower() != 'false',

    # Vite builds into <BASE_DIR>/build; the build is served at /build/...
    # by the django_vite_plugin.urls include in config/urls.py.
    'BUILD_DIR': 'build',
    'BUILD_URL_PREFIX': '/build/',

    # <script> attributes used only for production builds.
    'JS_ATTRS_BUILD': {
        'type': 'module',
        'defer': True,
    },
}
