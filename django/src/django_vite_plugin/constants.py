from pathlib import Path
from django.conf import settings, global_settings
from django.core.exceptions import ImproperlyConfigured


def _get_base_dir() -> Path:
    base_dir = getattr(settings, 'BASE_DIR', None)
    if not base_dir:
        raise ImproperlyConfigured(
            'django_vite_plugin requires BASE_DIR to be set in your settings. '
            'It is used to locate static assets, the build directory and the '
            'Vite hot file.'
        )
    return Path(base_dir)


# Project root, used to express found assets relative to it
BASE_DIR = _get_base_dir()

# Default configuration
DEFAULT_CONFIG = {
    'WS_CLIENT': '@vite/client',
    'HOT_FILE': None,
    'DEV_MODE': getattr(settings, 'DEBUG', global_settings.DEBUG),
    'BUILD_DIR': getattr(settings, 'STATIC_ROOT', global_settings.STATIC_ROOT) or BASE_DIR / 'static',
    'MANIFEST': None,
    'BUILD_URL_PREFIX': getattr(settings, 'STATIC_URL', global_settings.STATIC_URL),
    'JS_ATTRS': {
        'type': 'module',
    },
    'CSS_ATTRS': {
        'rel': 'stylesheet',
        'type': 'text/css'
    },
    'STATIC_LOOKUP': True,
}

# File extensions
CSS_EXTENSIONS = {'.css', '.scss', '.sass', '.less'}