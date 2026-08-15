import os
from typing import Any, Dict
from django.conf import settings
from django.contrib.staticfiles import finders
from django.core.exceptions import SuspiciousFileOperation
from django.utils.html import conditional_escape
from django.utils.safestring import SafeString, mark_safe
from urllib.parse import urljoin
from .config_helper import get_config
from .constants import BASE_DIR, IS_CSS
from .cache import FOUND_FILES_CACHE, VITE_MANIFEST, DEV_SERVER
from .manifest import get_manifest_entry, load_manifest

CONFIG = get_config()

RETRY_MISSES = bool(getattr(settings, 'DEBUG', False))

# Set JS attributes for build mode
if not CONFIG['DEV_MODE'] and CONFIG.get('JS_ATTRS_BUILD') is not None:
    CONFIG['JS_ATTRS'] = CONFIG['JS_ATTRS_BUILD']

if not CONFIG['DEV_MODE']:
    manifest_path = CONFIG['MANIFEST']
    load_manifest(manifest_path)


def make_attrs(attrs: Dict[str, Any]) -> SafeString:
    parts = []
    for key, val in attrs.items():
        if val is False or val is None:
            continue
        key = conditional_escape(key)
        if val is True:
            parts.append(key)
        else:
            parts.append(f'{key}="{conditional_escape(val)}"')
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
    url = urljoin(CONFIG['BUILD_URL_PREFIX'], manifest_entry["file"])
    if IS_CSS.search(path) or url.endswith('.css'):
        assets += _link(url, attrs['css'])
    else:
        assets += _script(url, attrs['js'])
    return assets



def _get_css_files(
    manifest_entry: Dict[str, str],
    attrs: Dict[str, str],
    already_processed = None
) -> str:
    if already_processed is None:
        already_processed = []
    html = ''

    if 'imports' in manifest_entry:
        for import_path in manifest_entry['imports']:
            html += _get_css_files(
                VITE_MANIFEST[import_path],
                attrs,
                already_processed
            )

    if 'css' in manifest_entry:
        for css_path in manifest_entry['css']:
            if css_path not in already_processed:
                html += _link(
                    urljoin(CONFIG['BUILD_URL_PREFIX'], css_path),
                    DEFAULT_CSS_ATTRS,
                )
            already_processed.append(css_path)

    return html



def _spaced(attrs: str) -> str:
    return f' {attrs}' if attrs else ''


def _link(url: str, attrs: str) -> str:
    return f'<link{_spaced(attrs)} href="{conditional_escape(url)}" />'


def _script(url: str, attrs: str) -> str:
    return f'<script{_spaced(attrs)} src="{conditional_escape(url)}"></script>'



def _dev_url(dev_server: str, path: str) -> str:
    if not (path.startswith('../') or os.path.isabs(path)):
        return f'{dev_server}/{path}'
    absolute = os.path.normpath(os.path.join(BASE_DIR, path)).replace('\\', '/')
    return f'{dev_server}/@fs/{absolute.lstrip("/")}'


def get_html_dev(url: str, attrs: Dict[str, str]) -> str:
    global DEV_SERVER
    if DEV_SERVER is None:
        try:
            with open(CONFIG['HOT_FILE'], 'r') as hotfile:
                DEV_SERVER = hotfile.read()
        except:
            raise Exception("Vite dev server is not started!")
    if IS_CSS.search(url):
        return _link(_dev_url(DEV_SERVER, url), attrs['css'])
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
        return _script(_dev_url(DEV_SERVER, url), attrs['js'])
    


def _relative_to_base(found: str) -> str:
    try:
        relative = os.path.relpath(found, BASE_DIR)
    except ValueError:
        relative = found
    return relative.replace('\\', '/')


class PendingAsset(str):
    __slots__ = ()


def resolve_asset(arg: str) -> str:
    found = find_asset(arg)
    if CONFIG['STATIC_LOOKUP'] and arg not in FOUND_FILES_CACHE:
        return PendingAsset(arg)
    return found


def find_asset(arg: str) -> str:
    """Find asset using Django's static finder with caching."""
    if arg in FOUND_FILES_CACHE:
        return FOUND_FILES_CACHE[arg]

    names_a_file = os.path.isabs(arg) and os.path.exists(arg)

    if not CONFIG['STATIC_LOOKUP']:
        return arg if names_a_file else arg.strip('/\\')

    if names_a_file:
        final = _relative_to_base(arg)
        FOUND_FILES_CACHE[str(arg)] = final
        return final

    relative = arg.strip('/\\')

    try:
        found = finders.find(relative, False)
    except SuspiciousFileOperation:
        found = None

    if found is None:
        if not RETRY_MISSES:
            FOUND_FILES_CACHE[str(arg)] = relative
        return relative

    final = _relative_to_base(found)
    FOUND_FILES_CACHE[str(arg)] = final
    return final
