from typing import Dict
from django.conf import settings
from django.contrib.staticfiles import finders
from urllib.parse import urljoin
from .config_helper import get_config
from .constants import ROOT_DIR_LEN
from .cache import FOUND_FILES_CACHE, VITE_MANIFEST, DEV_SERVER
from .manifest import get_manifest_entry, load_manifest
from .html import get_html

# Length of the root directory
ROOT_DIR_LEN = len(str(getattr(settings, "BASE_DIR")))

CONFIG = get_config()

# Ensure BUILD_URL_PREFIX ends with '/'
if not CONFIG['BUILD_URL_PREFIX'].endswith('/'):
    CONFIG['BUILD_URL_PREFIX'] += '/'

# Set JS attributes for build mode
if CONFIG['DEV_MODE'] is False and 'JS_ATTRS_BUILD' in CONFIG:
    CONFIG['JS_ATTRS'] = CONFIG['JS_ATTRS_BUILD']

if not CONFIG['DEV_MODE']:
    manifest_path = CONFIG['MANIFEST']
    load_manifest(manifest_path)


def make_attrs(attrs: Dict[str, any]):
    """
    Compile attributes to a string
    if attr is True then just add the attribute
    """
    attr_str = ''
    for key, val in attrs.items():
        attr_str += key

        if val is False:
            attr_str += '="false"'
        elif val is not True:
            attr_str += f'="{val}"'
        attr_str += ' '
    return attr_str[0:-1]



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
                html += get_html(
                    urljoin(CONFIG['BUILD_URL_PREFIX'], css_path),
                    attrs
                )
            already_processed.append(css_path)

    return html



def get_html(url: str, attrs: Dict[str, str]) -> str:
    if url.endswith('.css'):
        return f'<link {attrs["css"]} href="{url}" />'
    else:
        return f'<script {attrs["js"]} src="{url}"></script>'
    

def get_html_dev(url: str, attrs: Dict[str, str]) -> str:
    global DEV_SERVER
    if DEV_SERVER is None:
        try:
            with open(CONFIG['HOT_FILE'], 'r') as hotfile:
                DEV_SERVER = hotfile.read()
        except:
            raise Exception("Vite dev server is not started!")
    if url.endswith(('.css', '.scss', '.sass', '.less')):
        return f'<link {attrs["css"]} href="{DEV_SERVER}/{url}" />'
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
        return f'<script {attrs["js"]} src="{DEV_SERVER}/{url}"></script>'
    


def find_asset(arg: str) -> str:
    """Find asset using Django's static finder with caching."""
    if arg in FOUND_FILES_CACHE:
        return FOUND_FILES_CACHE[arg]
    
    if not CONFIG['STATIC_LOOKUP']:
        return arg
    
    found = finders.find(arg, False)
    final = (found[ROOT_DIR_LEN:].strip('/\\').replace('\\', '/') 
             if found is not None 
             else arg.strip('/\\'))
    
    FOUND_FILES_CACHE[arg] = final
    return final
