from typing import Dict, List, Any, Optional, Tuple
from django import template
from ..utils import CONFIG, get_from_manifest, get_html_dev, find_asset, make_attrs
import copy


def make_template_attrs(attrs: Dict[str, str]) -> Dict[str, str]:
    """Create template-specific attributes with proper copying and caching."""
    js_attrs = copy.copy(CONFIG['JS_ATTRS'])
    css_attrs = copy.copy(CONFIG['CSS_ATTRS'])

    for key, value in attrs.items():
        js_attrs[key] = value
        css_attrs[key] = value
    
    return {
        'js': make_attrs(js_attrs),
        'css': make_attrs(css_attrs)
    }

QUOTES = ('"', "'")


def _unquote(value: str, bit: Optional[str] = None) -> str:
    if len(value) < 2 or value[-1] != value[0]:
        raise template.TemplateSyntaxError(
            f"The 'vite' tag got an unterminated string: {bit or value}"
        )
    return value[1:-1]


def parse_template_args(bits: List[str]) -> Tuple[List[Any], Dict[str, Any], bool, bool]:
    """Parse template tag arguments into assets and attributes."""
    if not bits and CONFIG['DEV_MODE']:
        return [CONFIG['WS_CLIENT']], {}, False, False

    assets: List[Any] = []
    kwargs: Dict[str, Any] = {}
    has_dynamic_path = False
    has_dynamic_attr = False

    for bit in bits:
        if not bit:
            raise template.TemplateSyntaxError("The 'vite' tag got an empty argument")

        if bit[0] in QUOTES:
            # A quoted argument is always an asset path, even if it contains '='
            assets.append(find_asset(_unquote(bit)))
        elif '=' in bit:
            key, value = bit.split('=', maxsplit=1)
            if not key:
                raise template.TemplateSyntaxError(
                    f"The 'vite' tag got an attribute without a name: {bit}"
                )
            if not value:
                raise template.TemplateSyntaxError(
                    f"The 'vite' tag got an attribute without a value: {bit}"
                )
            if value[0] in QUOTES:
                kwargs[key] = _unquote(value, bit)
            else:
                has_dynamic_attr = True
                kwargs[key] = template.Variable(value)
        else:
            has_dynamic_path = True
            assets.append(template.Variable(bit))

    return assets, kwargs, has_dynamic_path, has_dynamic_attr

def make_template_asset(asset: str, attrs: Dict[str, str]) -> str:
    """Generate asset HTML based on mode."""
    return get_html_dev(asset, attrs) if CONFIG['DEV_MODE'] else get_from_manifest(asset, attrs)