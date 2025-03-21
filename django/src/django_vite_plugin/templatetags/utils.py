from typing import Dict, List, Any, Tuple
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

def parse_template_args(bits: List[str]) -> Tuple[List[Any], Dict[str, Any], bool, bool]:
    """Parse template tag arguments into assets and attributes."""
    if not bits and CONFIG['DEV_MODE']:
        return [CONFIG['WS_CLIENT']], {}, False, False
    
    assets: List[Any] = []
    kwargs: Dict[str, Any] = {}
    has_dynamic_path = False
    has_dynamic_attr = False

    for bit in bits:
        if '=' in bit:
            key, value = bit.split('=', maxsplit=1)
            if value[0] not in ['\'', '"']:
                has_dynamic_attr = True
                value = template.Variable(value)
            else:
                value = value[1:-1]
            kwargs[key] = value
        else:
            if bit[0] not in ['\'', '"']:
                has_dynamic_path = True
                path = template.Variable(bit)
            else:
                path = find_asset(bit[1:-1])
            assets.append(path)
    
    return assets, kwargs, has_dynamic_path, has_dynamic_attr

def make_template_asset(asset: str, attrs: Dict[str, str]) -> str:
    """Generate asset HTML based on mode."""
    return get_html_dev(asset, attrs) if CONFIG['DEV_MODE'] else get_from_manifest(asset, attrs)