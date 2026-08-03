from typing import Any, Dict, Optional

# Cache for previously searched files
FOUND_FILES_CACHE: Dict[str, str] = {}

# Cache for manifest data
VITE_MANIFEST: Dict[str, Any] = {}

# Cache for dev server URL
DEV_SERVER: Optional[str] = None


def clear_caches() -> None:
    """Clear all caches."""
    global DEV_SERVER
    FOUND_FILES_CACHE.clear()
    VITE_MANIFEST.clear()
    DEV_SERVER = None
