from django.conf import settings


# MANIFEST_PATH = Path(MANIFEST_PATH)
DEFAULT = {
    'WS_CLIENT': '@vite/client',
    'DEV_MODE': getattr(settings, 'DEBUG', True),
    'BUILD_DIR': getattr(settings, 'STATIC_ROOT') or 'static',
    'BUILD_URL_PREFIX': getattr(settings, 'STATIC_URL'), # Manifest paths would be prefixed with this
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


def get_config(
    config: dict = getattr(settings, 'DJANGO_VITE_PLUGIN', None),
    default: str = DEFAULT
) -> dict:

    if type(config) != type(default):
        return default

    for key in default:
        if not key in config:
            config[key] = default[key]
        elif type(default[key]) == dict:
            config[key] = get_config(config[key], default[key])

    return config