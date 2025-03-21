import json
import sys
from pathlib import Path
from urllib.parse import urljoin
from typing import Dict, Any, Union
from .html import get_html
from .constants import DEFAULT_CONFIG
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

def get_manifest_css_files(manifest_entry: Dict[str, Any], attrs: Dict[str, str], already_processed: Union[set, None] = None) -> str:
    """Get CSS files from manifest entry."""
    if already_processed is None:
        already_processed = set()
    
    html = []
    
    # Process imports recursively
    if 'imports' in manifest_entry:
        for import_path in manifest_entry['imports']:
            html.append(get_manifest_css_files(
                VITE_MANIFEST[import_path],
                attrs,
                already_processed
            ))
    
    # Process CSS files
    if 'css' in manifest_entry:
        for css_path in manifest_entry['css']:
            if css_path not in already_processed:
                html.append(get_html(
                    urljoin(DEFAULT_CONFIG['BUILD_URL_PREFIX'], css_path),
                    attrs
                ))
                already_processed.add(css_path)
    
    return ''.join(html) 