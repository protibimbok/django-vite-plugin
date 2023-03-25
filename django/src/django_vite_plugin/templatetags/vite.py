from typing import List
from urllib.parse import urljoin
from django import template
from ..utils import CONFIG, get_from_manifest, get_html

register = template.Library()


@register.tag()
def vite(parser, token):

    bits:List[str] = token.split_contents()[1:]

    assets: List[str] = []
    kwargs = {}

    if len(bits) == 0 and CONFIG['DEV_MODE']:
        assets.append(CONFIG['WS_CLIENT'])
    
    for bit in bits:
        if '=' in bit:
            key, value = bit.split('=', maxsplit=1)
            value=value[1:-1]
            kwargs[key] = value
        else:
            path=_find_asset(bit[1:-1])
            assets.append(path)

    assets_html = _make_assets(assets, kwargs)

    
    return ViteAssetNode(assets_html)


class ViteAssetNode(template.Node):
    def __init__(self, assets):
        self.assets = assets

    def render(self, context):
        return self.assets


def _find_asset(arg: str):
    if not CONFIG['STATIC_LOOKUP']:
        return arg
    
    pathArr = arg.split('/')
    if len(pathArr) < 2:
        pathArr.insert(0, 'static')
    elif pathArr[1] != 'static':
        pathArr.insert(1, 'static')
    return '/'.join(pathArr)


def _make_assets(assets: List[str], attrs: dict) -> str:
    js_attrs = CONFIG['JS_ATTRS']
    css_attrs = CONFIG['CSS_ATTRS']

    for i in attrs:
        js_attrs[i] = attrs[i]
        css_attrs[i] = attrs[i]
    
    js_attrs = " ".join(
        [f'{key}="{value}"' for key, value in js_attrs.items()]
    )
    css_attrs = " ".join(
        [f'{key}="{value}"' for key, value in css_attrs.items()]
    )

    return "".join(
        [_make_asset(asset, js_attrs, css_attrs) for asset in assets]
    )

def _make_asset(asset: str, js_attrs: str, css_attrs: str):
    if CONFIG['DEV_MODE']:
        url = urljoin(
            f"{'https' if CONFIG['SERVER']['HTTPS'] else 'http'}://"
            f"{CONFIG['SERVER']['HOST']}:{CONFIG['SERVER']['PORT']}",
            asset,
        )
        return get_html(url, js_attrs, css_attrs)

    return get_from_manifest(asset, js_attrs, css_attrs)
