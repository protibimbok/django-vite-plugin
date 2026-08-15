import site
import sys
import sysconfig
from pathlib import Path
from typing import Dict, List
from django.apps import AppConfig, apps
import django
from ...constants import BASE_DIR
from ...utils import find_asset


def _installed_package_roots() -> List[Path]:
    candidates = [sysconfig.get_paths().get(name) for name in ('purelib', 'platlib')]
    if hasattr(site, 'getsitepackages'):
        candidates += site.getsitepackages()
    if hasattr(site, 'getusersitepackages'):
        candidates.append(site.getusersitepackages())
    if sys.prefix != sys.base_prefix:
        candidates.append(sys.prefix)

    roots = []
    for candidate in candidates:
        if not candidate:
            continue
        try:
            roots.append(Path(candidate).resolve())
        except OSError:
            continue
    return roots


INSTALLED_PACKAGE_ROOTS = _installed_package_roots()


def _is_project_app(app_config: AppConfig) -> bool:
    """Whether an app lives inside this project, rather than being installed."""
    if app_config.name == 'django_vite_plugin':
        return False
    try:
        path = Path(app_config.path).resolve()
        if not path.is_relative_to(BASE_DIR.resolve()):
            return False
    except (OSError, ValueError):
        return False
    return not any(path.is_relative_to(root) for root in INSTALLED_PACKAGE_ROOTS)

def get_installed_apps() -> Dict[str, str]:
    """Get a mapping of project app labels to their paths."""
    return {
        app_config.label: app_config.path
        for app_config in apps.get_app_configs()
        if _is_project_app(app_config)
    }

def format_config_for_output(config: Dict) -> Dict:
    """Format configuration for JSON output."""
    config["BUILD_DIR"] = str(config["BUILD_DIR"])
    config['MANIFEST'] = str(config['MANIFEST'])
    config['INSTALLED_APPS'] = get_installed_apps()
    config['DJANGO_VERSION'] = django.get_version()
    return config

def find_static_assets(assets: list[str]) -> list[str]:
    """Find static assets using the asset finder."""
    return [find_asset(asset) for asset in assets] 