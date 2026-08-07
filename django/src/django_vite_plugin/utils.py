import os
from typing import Any, Dict, Optional, Set
from django.contrib.staticfiles import finders
from django.utils.html import conditional_escape
from django.utils.safestring import SafeString, mark_safe
from urllib.parse import urljoin
from .config_helper import get_config
from . import cache
from .constants import BASE_DIR, CSS_EXTENSIONS
from .cache import FOUND_FILES_CACHE
from .manifest import get_manifest_entry, load_manifest

CONFIG = get_config()

# Set JS attributes for build mode
if CONFIG['DEV_MODE'] is False and 'JS_ATTRS_BUILD' in CONFIG:
    CONFIG['JS_ATTRS'] = CONFIG['JS_ATTRS_BUILD']

if not CONFIG['DEV_MODE']:
    manifest_path = CONFIG['MANIFEST']
    load_manifest(manifest_path)


def make_attrs(attrs: Dict[str, Any]) -> SafeString:
    """
    Compile attributes to a string
    if attr is True then just add the attribute
    """
    parts = []
    for key, val in attrs.items():
        key = conditional_escape(key)
        if val is True:
            parts.append(key)
        else:
            value = 'false' if val is False else val
            parts.append(f'{key}="{conditional_escape(value)}"')
    return mark_safe(' '.join(parts))



# Compile the default css attributes beforehand
DEFAULT_CSS_ATTRS = make_attrs(CONFIG['CSS_ATTRS'])


def get_from_manifest(path: str, attrs: Dict[str, str]) -> str:
    """Get assets from manifest for a given path."""
    if path == 'react':
        return ''
    manifest_entry = get_manifest_entry(path)
    assets = _get_css_files(manifest_entry, {
        'css': DEFAULT_CSS_ATTRS
    })
    assets += get_html(
        urljoin(CONFIG['BUILD_URL_PREFIX'], manifest_entry["file"]),
        attrs
    )
    return assets



def _get_css_files(
    manifest_entry: Dict[str, str],
    attrs: Dict[str, str],
    seen_imports: Optional[Set[str]] = None,
    seen_css: Optional[Set[str]] = None,
) -> str:
    if seen_imports is None:
        seen_imports = set()
    if seen_css is None:
        seen_css = set()
    html = ''

    for import_path in manifest_entry.get('imports', ()):
        if import_path in seen_imports:
            continue
        seen_imports.add(import_path)
        html += _get_css_files(
            get_manifest_entry(import_path),
            attrs,
            seen_imports,
            seen_css
        )

    for css_path in manifest_entry.get('css', ()):
        if css_path in seen_css:
            continue
        seen_css.add(css_path)
        html += get_html(
            urljoin(CONFIG['BUILD_URL_PREFIX'], css_path),
            attrs
        )

    return html



def get_html(url: str, attrs: Dict[str, str]) -> str:
    is_css = url.endswith('.css')
    url = conditional_escape(url)
    if is_css:
        return f'<link {attrs["css"]} href="{url}" />'
    else:
        return f'<script {attrs["js"]} src="{url}"></script>'


def get_dev_server() -> str:
    """URL of the running Vite dev server, read from the hot file once."""
    if cache.DEV_SERVER is None:
        try:
            with open(CONFIG['HOT_FILE'], 'r', encoding='utf-8') as hotfile:
                cache.DEV_SERVER = hotfile.read()
        except OSError:
            raise Exception("Vite dev server is not started!")
    return cache.DEV_SERVER


def get_html_dev(url: str, attrs: Dict[str, str]) -> str:
    DEV_SERVER = get_dev_server()
    if url.endswith(CSS_EXTENSIONS):
        return f'<link {attrs["css"]} href="{conditional_escape(f"{DEV_SERVER}/{url}")}" />'
    elif url == 'react':
        return f"""
        <script type="module">
        import RefreshRuntime from "{DEV_SERVER}/@react-refresh"
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {{}}
        window.$RefreshSig$ = () => (type) => type
        window.__vite_plugin_react_preamble_installed__ = true
        </script>
        """
    else:
        return f'<script {attrs["js"]} src="{conditional_escape(f"{DEV_SERVER}/{url}")}"></script>'
    


def _relative_to_base(found: str) -> str:
    try:
        relative = os.path.relpath(found, BASE_DIR)
    except ValueError:
        # On Windows there is no relative path between different drives
        relative = found
    return relative.replace('\\', '/')


def find_asset(arg: str) -> str:
    """Find asset using Django's static finder with caching."""
    if arg in FOUND_FILES_CACHE:
        return FOUND_FILES_CACHE[arg]

    if not CONFIG['STATIC_LOOKUP']:
        return arg

    found = finders.find(arg, False)
    final = _relative_to_base(found) if found is not None else arg.strip('/\\')

    FOUND_FILES_CACHE[arg] = final
    return final
