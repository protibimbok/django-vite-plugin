from typing import Dict, List, Any
from django import template
from ..manifest import current_signature
from ..utils import CONFIG, PendingAsset, find_asset
from .utils import make_template_attrs, make_template_assets

class ViteAssetNode(template.Node):
    """Template node for rendering Vite assets."""

    def __init__(self, assets: List[Any], attributes: Dict[str, Any], has_dynamic_attr: bool, has_dynamic_path: bool):
        self.assets = assets
        self.attributes = attributes
        self.html = None
        self.html_signature = None
        self.attrs = None
        self.has_dynamic_path = has_dynamic_path

        if not has_dynamic_attr:
            self.attrs = make_template_attrs(attributes)
            self.attributes = None

        if not has_dynamic_attr and not has_dynamic_path and not CONFIG['DEV_MODE']:
            self.html = make_template_assets(assets, self.attrs)
            self.html_signature = current_signature()

    def render(self, context: template.Context) -> str:
        """Render the node with the given context."""
        if self.html is not None:
            if current_signature() == self.html_signature:
                return self.html
            self.html = make_template_assets(self.assets, self.attrs)
            self.html_signature = current_signature()
            return self.html

        attrs = self.attrs
        if self.attributes is not None:
            attrs = make_template_attrs({
                name: val.resolve(context) if not isinstance(val, str) else val
                for name, val in self.attributes.items()
            })

        return make_template_assets(self.get_assets(context), attrs)

    def get_assets(self, context: template.Context) -> List[str]:
        """Get resolved assets from context."""
        if not self.has_dynamic_path:
            return self.assets

        assets = []
        for var in self.assets:
            if isinstance(var, PendingAsset):
                assets.append(find_asset(var))
            elif isinstance(var, str):
                assets.append(var)
            else:
                var = var.resolve(context, ignore_failures=True)
                if not var:
                    continue
                assets.append(find_asset(var))
        return assets
