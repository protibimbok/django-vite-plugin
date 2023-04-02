from typing import Dict, List
from django.conf import settings
from urllib.parse import urljoin
from .config_helper import get_config
import json

# Length of the root directory
ROOT_DIR_LEN = len(str(getattr(settings, "BASE_DIR")))


CONFIG = get_config()

# Make sure 'BUILD_URL_PREFIX' finish with a '/'
if CONFIG['BUILD_URL_PREFIX'][-1] != "/":
    CONFIG['BUILD_URL_PREFIX'] += "/"

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


def get_from_manifest(path: str, attrs: Dict[str, str]) -> str:
    if path not in VITE_MANIFEST:
        raise RuntimeError(
            f"Cannot find {path} in Vite manifest "
        )
    
    manifest_entry = VITE_MANIFEST[path]
    assets = _get_css_files(manifest_entry, attrs)
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
                    '',
                    attrs
                )
            already_processed.append(css_path)

    return html



def get_html(url: str, attrs: Dict[str, str]) -> str:
    if url.endswith('.css'):
        return f'<link {attrs["css"]} href="{url}" />'
    else:
        return f'<script {attrs["js"]} src="{url}"></script>'
    

