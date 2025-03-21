from typing import List
from django import template
from .nodes import ViteAssetNode
from .utils import parse_template_args

register = template.Library()

@register.tag()
def vite(_, token):
    """Template tag for rendering Vite assets."""
    bits: List[str] = token.split_contents()[1:]
    assets, kwargs, has_dynamic_path, has_dynamic_attr = parse_template_args(bits)
    
    return ViteAssetNode(
        assets=assets,
        attributes=kwargs,
        has_dynamic_attr=has_dynamic_attr,
        has_dynamic_path=has_dynamic_path
    )
