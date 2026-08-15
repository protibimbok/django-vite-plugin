import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union


Signature = Optional[Tuple[int, int]]

# What one read of the manifest produced: the signature it was taken under,
# the entries, and the error that stood in for them.
Manifest = Tuple[Signature, Dict[str, Any], Optional[str]]


def file_signature(path: Union[str, Path]) -> Signature:
    try:
        info = os.stat(path)
    except OSError:
        return None
    return (info.st_mtime_ns, info.st_size)


# Cache for previously searched files
FOUND_FILES_CACHE: Dict[str, str] = {}

# Cache for manifest data. The three travel together and are replaced in one
# assignment, never amended in place: a signature standing on its own is one
# another thread reads, over the entries of the build before it, or over none.
VITE_MANIFEST: Optional[Manifest] = None

# Cache for dev server URL
DEV_SERVER: Optional[str] = None


def clear_caches() -> None:
    """Clear all caches."""
    global DEV_SERVER, VITE_MANIFEST
    FOUND_FILES_CACHE.clear()
    VITE_MANIFEST = None
    DEV_SERVER = None
