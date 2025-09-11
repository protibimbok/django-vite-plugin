from typing import Dict, Any, Union
from functools import lru_cache

# Cache for previously searched files
FOUND_FILES_CACHE: Dict[str, str] = {}

# Cache for manifest data
VITE_MANIFEST: Dict[str, Any] = {}

# Cache for dev server URL
DEV_SERVER: Union[str, None] = None

@lru_cache(maxsize=128)
def get_cached_manifest(manifest_path: str) -> Dict[str, Any]:
    """Cache and return the manifest data."""
    return VITE_MANIFEST.get(manifest_path, {})

def clear_caches() -> None:
    """Clear all caches."""
    FOUND_FILES_CACHE.clear()
    VITE_MANIFEST.clear()
    global DEV_SERVER
    DEV_SERVER = None
    get_cached_manifest.cache_clear() 