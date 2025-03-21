from django.conf import settings, global_settings

# Default configuration
DEFAULT_CONFIG = {
    'WS_CLIENT': '@vite/client',
    'HOT_FILE': None,
    'DEV_MODE': getattr(settings, 'DEBUG', global_settings.DEBUG),
    'BUILD_DIR': getattr(settings, 'STATIC_ROOT', global_settings.STATIC_ROOT) or getattr(settings, 'BASE_DIR') / 'static',
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

# Root directory length for path calculations
ROOT_DIR_LEN = len(str(getattr(settings, "BASE_DIR"))) 