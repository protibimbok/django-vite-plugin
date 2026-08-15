import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional
from django.conf import settings
from . import cache
from .cache import Signature, file_signature

MANIFEST_PATH: Optional[Path] = None

WATCH_MANIFEST = bool(getattr(settings, 'DEBUG', False))


def load_manifest(manifest_path: Path) -> Dict[str, Any]:
    """Load and cache the Vite manifest file.

    The signature is taken before the read: taken after, a build landing
    between the two stamps the new signature onto the old entries, and every
    later read is handed them as current.
    """
    global MANIFEST_PATH
    MANIFEST_PATH = manifest_path
    signature = file_signature(manifest_path)
    try:
        with open(manifest_path, "r", encoding="utf-8") as manifest_file:
            manifest_data = json.load(manifest_file)
        if not isinstance(manifest_data, dict):
            raise ValueError("the manifest is not a JSON object")
    except FileNotFoundError:
        error = (
            f"the Vite manifest was not found at {manifest_path}. "
            "Run the Vite build to generate it, or set DEV_MODE to True in "
            "DJANGO_VITE_PLUGIN to load assets from the dev server instead"
        )
        cache.VITE_MANIFEST = (signature, {}, error)
        sys.stderr.write(f"django_vite_plugin: {error}\n")
        return {}
    except Exception as error:
        cache.VITE_MANIFEST = (
            signature,
            {},
            f"the Vite manifest at {manifest_path} could not be read: {error}",
        )
        raise RuntimeError(f"Cannot read Vite manifest file at {manifest_path}: {error}")
    cache.VITE_MANIFEST = (signature, manifest_data, None)
    return manifest_data


def current_signature() -> Signature:
    if MANIFEST_PATH is None:
        manifest = cache.VITE_MANIFEST
        return manifest[0] if manifest is not None else None
    manifest = cache.VITE_MANIFEST
    if manifest is None:
        load_manifest(MANIFEST_PATH)
    elif WATCH_MANIFEST and file_signature(MANIFEST_PATH) != manifest[0]:
        load_manifest(MANIFEST_PATH)
    manifest = cache.VITE_MANIFEST
    return manifest[0] if manifest is not None else None


def get_manifest_entry(path: str) -> Dict[str, Any]:
    current_signature()
    manifest = cache.VITE_MANIFEST
    entries = manifest[1] if manifest is not None else {}
    if path not in entries:
        error = manifest[2] if manifest is not None else None
        if error is not None:
            raise RuntimeError(f"Cannot resolve {path}: {error}")
        raise RuntimeError(f"Cannot find {path} in Vite manifest")
    return entries[path]
