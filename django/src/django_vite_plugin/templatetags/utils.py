import re
from typing import Dict, List, Any, Optional, Set, Tuple
from django import template
from django.utils.text import unescape_string_literal
from ..utils import (
    CONFIG,
    PendingAsset,
    get_from_manifest,
    get_html_dev,
    make_attrs,
    resolve_asset,
)
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

STRING_LITERAL = re.compile(r"""("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')""")

ATTRIBUTE = re.compile(r"""[^|'"=]*=""")


def _unquote(
    parser: template.base.Parser, value: str, bit: Optional[str] = None
) -> Any:
    literal = STRING_LITERAL.match(value)
    if literal is None:
        raise template.TemplateSyntaxError(
            f"The 'vite' tag got an unterminated string: {bit or value}"
        )
    if literal.end() != len(value):
        return parser.compile_filter(value)
    return str(unescape_string_literal(value))


def parse_template_args(
    parser: template.base.Parser, bits: List[str]
) -> Tuple[List[Any], Dict[str, Any], bool, bool]:
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
            value = _unquote(parser, bit)
            if not isinstance(value, str):
                has_dynamic_path = True
                assets.append(value)
                continue
            asset = resolve_asset(value)
            if isinstance(asset, PendingAsset):
                has_dynamic_path = True
            assets.append(asset)
        elif ATTRIBUTE.match(bit):
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
                attr = _unquote(parser, value, bit)
            else:
                attr = parser.compile_filter(value)
            if not isinstance(attr, str):
                has_dynamic_attr = True
            kwargs[key] = attr
        else:
            has_dynamic_path = True
            assets.append(parser.compile_filter(bit))

    return assets, kwargs, has_dynamic_path, has_dynamic_attr

def make_template_assets(assets: List[str], attrs: Dict[str, str]) -> str:
    """Render every asset of one tag, as one run."""
    if CONFIG['DEV_MODE']:
        return ''.join(get_html_dev(asset, attrs) for asset in assets)

    seen_imports: Set[str] = set()
    seen_css: Set[str] = set()
    return ''.join(
        get_from_manifest(asset, attrs, seen_imports, seen_css)
        for asset in assets
    )
