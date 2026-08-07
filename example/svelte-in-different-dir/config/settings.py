"""
Settings for the `svelte-in-different-dir` example.

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
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {},
    },
]

STATIC_URL = 'static/'

DJANGO_VITE_PLUGIN = {
    # `DEV_MODE=False python manage.py runserver` serves the production build
    # made by `pnpm e:build svelte-in-different-dir`.
    'DEV_MODE': os.environ.get('DEV_MODE', 'True').lower() != 'false',

    # The Vite project lives in frontend/, so entries are plain Vite paths
    # like 'src/main.ts' — turn off the Django static file lookup.
    'STATIC_LOOKUP': False,

    # Vite resolves a relative BUILD_DIR against its own root (frontend/),
    # Django against BASE_DIR — an absolute path keeps them in agreement.
    'BUILD_DIR': BASE_DIR / 'build',
    'BUILD_URL_PREFIX': '/build/',
}
