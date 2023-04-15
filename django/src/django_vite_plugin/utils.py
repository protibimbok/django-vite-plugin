from typing import Dict, List
from django.conf import settings
from django.contrib.staticfiles import finders
from urllib.parse import urljoin
from .config_helper import get_config
import json

# Length of the root directory
ROOT_DIR_LEN = len(str(getattr(settings, "BASE_DIR")))

# Cache for previously searched files map
FOUND_FILES_CACHE = {}

CONFIG = get_config()

# Make sure 'BUILD_URL_PREFIX' finish with a '/'
if CONFIG['BUILD_URL_PREFIX'][-1] != "/":
    CONFIG['BUILD_URL_PREFIX'] += "/"

if CONFIG['DEV_MODE'] is False and 'JS_ATTRS_BUILD' in CONFIG:
    CONFIG['JS_ATTRS'] = CONFIG['JS_ATTRS_BUILD']

VITE_MANIFEST  = {}

if not CONFIG['DEV_MODE']:
    manifest_path = getattr(settings, 'BASE_DIR') / CONFIG['BUILD_DIR'].lstrip('/\\') / 'manifest.json'
    try:
        manifest_file = open(manifest_path, "r")
        manifest_content = manifest_file.read()
        manifest_file.close()
        VITE_MANIFEST = json.loads(manifest_content)
    except Exception as error:
        raise RuntimeError(
            f"Cannot read Vite manifest file at "
            f"{manifest_path} : {str(error)}"
        )



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
    if path not in VITE_MANIFEST:
        raise RuntimeError(
            f"Cannot find {path} in Vite manifest "
        )
    
    manifest_entry = VITE_MANIFEST[path]
    assets = _get_css_files(manifest_entry, {
        # The css files of a js 'import' should get the default attributes
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
    already_processed: List[str] = []
) -> str:

    html = ''

    if 'imports' in manifest_entry:
        for import_path in manifest_entry['imports']:
            html += _get_css_files(
                import_path,
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
    


def find_asset(arg: str) -> str:
    """
    If `STATIC_LOOKUP` is enabled then find the asset
    using djang's built-in static finder

    Cache the found files for later use
    """
    

    if arg in FOUND_FILES_CACHE:
        return FOUND_FILES_CACHE[arg] 
    
    if not CONFIG['STATIC_LOOKUP']:
        return arg
    

    found = finders.find(arg, False)

    if found is None:
        final = arg.strip('/\\')
    else:
        final = found[ROOT_DIR_LEN:].strip('/\\').replace('\\', '/')

    FOUND_FILES_CACHE[arg] = final

    return final
