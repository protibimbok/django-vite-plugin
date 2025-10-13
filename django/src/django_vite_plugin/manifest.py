import json
import sys
from pathlib import Path
from typing import Dict, Any
from .cache import VITE_MANIFEST

def load_manifest(manifest_path: Path) -> Dict[str, Any]:
    """Load and cache the Vite manifest file."""
    try:
        with open(manifest_path, "r") as manifest_file:
            manifest_data = json.load(manifest_file)
            VITE_MANIFEST.update(manifest_data)
            return manifest_data
    except FileNotFoundError:
        sys.stderr.write(f"Cannot read Vite manifest file at {manifest_path}\n")
        return {}
    except Exception as error:
        raise RuntimeError(f"Cannot read Vite manifest file at {manifest_path}: {error}")

def get_manifest_entry(path: str) -> Dict[str, Any]:
    """Get a manifest entry by path."""
    if path not in VITE_MANIFEST:
        raise RuntimeError(f"Cannot find {path} in Vite manifest")
    return VITE_MANIFEST[path]
