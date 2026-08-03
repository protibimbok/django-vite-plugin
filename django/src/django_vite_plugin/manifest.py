import json
import sys
from pathlib import Path
from typing import Dict, Any
from . import cache
from .cache import VITE_MANIFEST

def load_manifest(manifest_path: Path) -> Dict[str, Any]:
    """Load and cache the Vite manifest file."""
    try:
        with open(manifest_path, "r", encoding="utf-8") as manifest_file:
            manifest_data = json.load(manifest_file)
            VITE_MANIFEST.update(manifest_data)
            cache.MANIFEST_ERROR = None
            return manifest_data
    except FileNotFoundError:
        cache.MANIFEST_ERROR = (
            f"the Vite manifest was not found at {manifest_path}. "
            "Run the Vite build to generate it, or set DEV_MODE to True in "
            "DJANGO_VITE_PLUGIN to load assets from the dev server instead"
        )
        sys.stderr.write(f"django_vite_plugin: {cache.MANIFEST_ERROR}\n")
        return {}
    except Exception as error:
        raise RuntimeError(f"Cannot read Vite manifest file at {manifest_path}: {error}")

def get_manifest_entry(path: str) -> Dict[str, Any]:
    """Get a manifest entry by path."""
    if path not in VITE_MANIFEST:
        if cache.MANIFEST_ERROR is not None:
            raise RuntimeError(f"Cannot resolve {path}: {cache.MANIFEST_ERROR}")
        raise RuntimeError(f"Cannot find {path} in Vite manifest")
    return VITE_MANIFEST[path]
