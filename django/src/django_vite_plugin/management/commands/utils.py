from typing import Dict
from django.apps import apps
from ...config_helper import get_config
from ...utils import find_asset

def get_installed_apps() -> Dict[str, str]:
    """Get a mapping of installed app names to their paths."""
    app_configs = apps.get_app_configs()
    return {
        app_config.name: app_config.path
        for app_config in app_configs
        if '.' not in app_config.name and app_config.name != 'django_vite_plugin'
    }

def format_config_for_output(config: Dict) -> Dict:
    """Format configuration for JSON output."""
    if isinstance(config["BUILD_DIR"], str):
        config["BUILD_DIR"] = config["BUILD_DIR"].strip("/\\")
    else:
        config["BUILD_DIR"] = str(config["BUILD_DIR"])
    
    config['MANIFEST'] = str(config['MANIFEST'])
    config['INSTALLED_APPS'] = get_installed_apps()
    return config

def find_static_assets(assets: list[str]) -> list[str]:
    """Find static assets using the asset finder."""
    return [find_asset(asset) for asset in assets] 