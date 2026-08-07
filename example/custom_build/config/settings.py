"""
Settings for the `custom_build` example.

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
    'frontend',
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

DJANGO_VITE_PLUGIN = {
    # `DEV_MODE=False python manage.py runserver` serves the production build
    # (made by `python manage.py buildfrontend`) instead of the dev server.
    'DEV_MODE': os.environ.get('DEV_MODE', 'True').lower() != 'false',

    # The custom part: build into the frontend app's own dist/ directory
    # (an absolute Path, since the Vite config does not live at BASE_DIR)
    # and serve it at /assets/... instead of STATIC_URL.
    'BUILD_DIR': BASE_DIR / 'frontend' / 'dist',
    'BUILD_URL_PREFIX': '/assets/',
}
