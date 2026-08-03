from pathlib import Path
from typing import Dict
from django.apps import AppConfig, apps
import django
from ...constants import BASE_DIR
from ...utils import find_asset

def _is_project_app(app_config: AppConfig) -> bool:
    """Whether an app lives inside this project, rather than being installed."""
    if app_config.name == 'django_vite_plugin':
        return False
    try:
        return Path(app_config.path).resolve().is_relative_to(BASE_DIR.resolve())
    except (OSError, ValueError):
        return False

def get_installed_apps() -> Dict[str, str]:
    """Get a mapping of project app labels to their paths."""
    return {
        app_config.label: app_config.path
        for app_config in apps.get_app_configs()
        if _is_project_app(app_config)
    }

def format_config_for_output(config: Dict) -> Dict:
    """Format configuration for JSON output."""
    if isinstance(config["BUILD_DIR"], str):
        config["BUILD_DIR"] = config["BUILD_DIR"].strip("/\\")
    else:
        config["BUILD_DIR"] = str(config["BUILD_DIR"])
    
    config['MANIFEST'] = str(config['MANIFEST'])
    config['INSTALLED_APPS'] = get_installed_apps()
    config['DJANGO_VERSION'] = django.get_version()
    return config

def find_static_assets(assets: list[str]) -> list[str]:
    """Find static assets using the asset finder."""
    return [find_asset(asset) for asset in assets] 