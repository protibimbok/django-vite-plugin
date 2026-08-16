import copy
from typing import Dict, Any, Optional, Union
from urllib.parse import urlsplit
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from .constants import BASE_DIR, DEFAULT_CONFIG


def get_config() -> Dict[str, Any]:
    """Get and merge configuration with defaults."""
    config = getattr(settings, 'DJANGO_VITE_PLUGIN', None)
    config = _deep_copy(config, DEFAULT_CONFIG)

    config['BUILD_DIR'] = BASE_DIR / config['BUILD_DIR']

    if config['MANIFEST'] is None:
        config['MANIFEST'] = config['BUILD_DIR'] / '.vite' / 'manifest.json'
    else:
        config['MANIFEST'] = BASE_DIR / config['MANIFEST']

    if config['HOT_FILE'] is None:
        config['HOT_FILE'] = str(BASE_DIR / '.hotfile')
    else:
        config['HOT_FILE'] = str(BASE_DIR / config['HOT_FILE'])

    config['BUILD_URL_PREFIX'] = _build_url_prefix(
        config['BUILD_URL_PREFIX'], config['DEV_MODE']
    )

    config['DEV_MODE'] = bool(config['DEV_MODE'])
    if not config['DEV_MODE'] and config.get('JS_ATTRS_BUILD') is not None:
        config['JS_ATTRS'] = _deep_copy(
            config['JS_ATTRS_BUILD'], config['JS_ATTRS']
        )

    return config


def _build_url_prefix(prefix: Any, dev_mode: Any) -> Optional[str]:
    if not prefix:
        if dev_mode:
            return None
        raise ImproperlyConfigured(
            'django_vite_plugin needs to know the URL your built assets are '
            'served under, and neither STATIC_URL nor BUILD_URL_PREFIX in '
            'DJANGO_VITE_PLUGIN is set. Set one of them, e.g. '
            "STATIC_URL = 'static/'."
        )
    prefix = str(prefix)
    if not prefix.endswith('/'):
        prefix += '/'
    if not prefix.startswith('/') and not urlsplit(prefix).scheme:
        prefix = '/' + prefix
    return prefix


def _deep_copy(config: Union[Dict[str, Any], None], default: Dict[str, Any]) -> Dict[str, Any]:
    """Merge a configuration over the defaults, sharing nothing with either."""
    if not isinstance(config, dict):
        return copy.deepcopy(default)

    result = copy.deepcopy(default)
    for key, value in config.items():
        if isinstance(default.get(key), dict):
            result[key] = _deep_copy(value, default[key])
        else:
            result[key] = copy.deepcopy(value)

    return result
