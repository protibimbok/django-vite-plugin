from typing import Dict, Any
from .constants import DEFAULT_CONFIG, CSS_EXTENSIONS
from .cache import DEV_SERVER

def make_attrs(attrs: Dict[str, Any]) -> str:
    """Compile attributes to a string."""
    return ' '.join(
        f'{key}{"" if val is True else f"={repr(val)}"}'
        for key, val in attrs.items()
    )

def get_html(url: str, attrs: Dict[str, str]) -> str:
    """Generate HTML for a resource URL."""
    if url.endswith('.css'):
        return f'<link {attrs["css"]} href="{url}" />'
    return f'<script {attrs["js"]} src="{url}"></script>'

def get_html_dev(url: str, attrs: Dict[str, str]) -> str:
    """Generate HTML for development mode."""
    global DEV_SERVER
    if DEV_SERVER is None:
        try:
            with open(DEFAULT_CONFIG['HOT_FILE'], 'r') as hotfile:
                DEV_SERVER = hotfile.read()
        except:
            raise Exception("Vite dev server is not started!")

    if any(url.endswith(ext) for ext in CSS_EXTENSIONS):
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
    return f'<script {attrs["js"]} src="{DEV_SERVER}/{url}"></script>' 