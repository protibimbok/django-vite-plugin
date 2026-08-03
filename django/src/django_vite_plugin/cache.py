from typing import Any, Dict, Optional

# Cache for previously searched files
FOUND_FILES_CACHE: Dict[str, str] = {}

# Cache for manifest data
VITE_MANIFEST: Dict[str, Any] = {}

# Why the manifest could not be loaded, if it could not be
MANIFEST_ERROR: Optional[str] = None

# Cache for dev server URL
DEV_SERVER: Optional[str] = None


def clear_caches() -> None:
    """Clear all caches."""
    global DEV_SERVER, MANIFEST_ERROR
    FOUND_FILES_CACHE.clear()
    VITE_MANIFEST.clear()
    MANIFEST_ERROR = None
    DEV_SERVER = None
