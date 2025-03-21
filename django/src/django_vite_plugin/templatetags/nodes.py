from typing import Dict, List, Any
from django import template
from ..utils import find_asset
from .utils import make_template_attrs, make_template_asset

class ViteAssetNode(template.Node):
    """Template node for rendering Vite assets."""
    
    def __init__(self, assets: List[Any], attributes: Dict[str, Any], has_dynamic_attr: bool, has_dynamic_path: bool):
        self.assets = assets
        self.attributes = attributes
        self.html = None
        self.has_dynamic_path = has_dynamic_path

        if not has_dynamic_attr:
            self.attrs = make_template_attrs(attributes)
            self.attributes = None
        
        if not has_dynamic_attr and not has_dynamic_path:
            self.html = "".join(make_template_asset(asset, self.attrs) for asset in assets)
            self.assets = None

    def render(self, context: template.Context) -> str:
        """Render the node with the given context."""
        if self.html is not None:
            return self.html
        
        if self.attributes is not None:
            attrs = {
                name: val.resolve(context) if not isinstance(val, str) else val
                for name, val in self.attributes.items()
            }
            self.attrs = make_template_attrs(attrs)
        
        return "".join(
            make_template_asset(asset, self.attrs)
            for asset in self.get_assets(context)
        )

    def get_assets(self, context: template.Context) -> List[str]:
        """Get resolved assets from context."""
        if not self.has_dynamic_path:
            return self.assets
        
        assets = []
        for var in self.assets:
            if isinstance(var, str):
                assets.append(var)
            else:
                var = var.resolve(context)
                if not var:
                    continue
                assets.append(find_asset(var))
        return assets
