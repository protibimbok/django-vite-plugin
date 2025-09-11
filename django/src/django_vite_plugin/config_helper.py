from pathlib import Path
from typing import Dict, Any, Union
from django.conf import settings
from .constants import DEFAULT_CONFIG


def get_config() -> Dict[str, Any]:
    """Get and merge configuration with defaults."""
    config = getattr(settings, 'DJANGO_VITE_PLUGIN', None)
    config = _deep_copy(config, DEFAULT_CONFIG)
    
    # Handle manifest path
    if config['MANIFEST'] is None:
        build_dir = Path(config['BUILD_DIR']) if isinstance(config['BUILD_DIR'], str) else config['BUILD_DIR']
        config['MANIFEST'] = build_dir / '.vite' / 'manifest.json'
    elif isinstance(config['MANIFEST'], str):
        config['MANIFEST'] = Path(config['MANIFEST'])
    
    # Handle hot file path
    if config['HOT_FILE'] is None:
        config['HOT_FILE'] = str(getattr(settings, 'BASE_DIR') / '.hotfile')
    elif isinstance(config['HOT_FILE'], Path):
        config['HOT_FILE'] = str(config['HOT_FILE'])
    
    return config

def _deep_copy(config: Union[Dict[str, Any], None], default: Dict[str, Any]) -> Dict[str, Any]:
    """Deep copy configuration with defaults."""
    if config is None or type(config) != type(default):
        return default.copy()

    result = default.copy()
    for key, value in config.items():
        if key in default:
            if isinstance(default[key], dict):
                result[key] = _deep_copy(value, default[key])
            else:
                result[key] = value
        else:
            result[key] = value

    return result
