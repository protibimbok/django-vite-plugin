"""
Settings for the `stderr` example.

Deliberately minimal, and deliberately without a DJANGO_VITE_PLUGIN block:
this example runs the plugin entirely on its defaults. The point of the
example is the always-on warning registered in home/checks.py.
"""

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-example-key-not-for-production'

DEBUG = True

ALLOWED_HOSTS = []

INSTALLED_APPS = [
    'django.contrib.staticfiles',
    'django_vite_plugin',
    'home',
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
