from typing import List, Dict
from urllib.parse import urljoin
from django import template
from ..utils import CONFIG, get_from_manifest, get_html, find_asset, make_attrs
import copy

register = template.Library()


@register.tag()
def vite(parser, token):

    bits:List[str] = token.split_contents()[1:]

    assets: List[str] = []
    kwargs = {}
    hasDynamicPath = False
    hasDynamicAttr = False

    if len(bits) == 0 and CONFIG['DEV_MODE']:
        assets.append(CONFIG['WS_CLIENT'])
    
    for bit in bits:
        if '=' in bit:
            key, value = bit.split('=', maxsplit=1)
            if value[0] not in ['\'', '"']:
                hasDynamicAttr = True
                value = template.Variable(value)
            else:
                value=value[1:-1]
            kwargs[key] = value
        else:
            if bit[0] not in ['\'', '"']:
                hasDynamicPath = True
                path = template.Variable(bit)
            else:
                path=find_asset(bit[1:-1])
            assets.append(path)

    
    return ViteAssetNode(
        assets = assets,
        attributes = kwargs,
        hasDynamicAttr = hasDynamicAttr,
        hasDynamicPath = hasDynamicPath
    )


class ViteAssetNode(template.Node):
    def __init__(self, assets, attributes, hasDynamicAttr, hasDynamicPath):
        self.assets = assets
        self.attributes = attributes
        self.html = None
        self.hasDynamicPath = hasDynamicPath

        if not hasDynamicAttr:
            self.attrs = _make_attrs(attributes)
            self.attributes = None
        
        if not hasDynamicAttr and not hasDynamicPath:
            self.html   = "".join(_make_asset(asset, self.attrs) for asset in assets)
            self.assets = None
        

    def render(self, context):
        if self.html is not None:
            return self.html
        
        if self.attributes is not None:
            attrs = {}
            for name in self.attributes:
                val = self.attributes[name]
                if type(val) != str:
                    val = val.resolve(context)
                attrs[name] = val

            self.attrs = _make_attrs(attrs)
        
        return "".join([
            _make_asset(asset, self.attrs)
            for asset in
            self.get_assets(context)
        ])


    def get_assets(self, context) -> List[str]:
        if not self.hasDynamicPath:
            return self.assets
        
        assets = []
        for var in self.assets:
            if type(var) == str:
                assets.append(var)
            else:
                var = var.resolve(context)
                if not var:
                    continue
                assets.append(find_asset(var))
        return assets



def _make_attrs(attrs: Dict[str, str]) -> Dict[str, str]:
    """
    If not copied, reference is stored in the
    `js_attrs` & `css_attrs` variables
    And then it overrides the config for subsequent
    assets
    """
    js_attrs = copy.copy(CONFIG['JS_ATTRS'])
    css_attrs = copy.copy(CONFIG['CSS_ATTRS'])

    for i in attrs:
        js_attrs[i] = attrs[i]
        css_attrs[i] = attrs[i]
    
    js_attrs = make_attrs(js_attrs)
    css_attrs = make_attrs(css_attrs)

    return {
        'js': js_attrs,
        'css': css_attrs
    }



def _make_asset(asset: str, attrs:Dict[str, str]):
    if CONFIG['DEV_MODE']:
        url = urljoin(
            f"{'https' if CONFIG['SERVER']['HTTPS'] else 'http'}://"
            f"{CONFIG['SERVER']['HOST']}:{CONFIG['SERVER']['PORT']}",
            asset,
        )
        return get_html(url, attrs)

    return get_from_manifest(asset, attrs)
