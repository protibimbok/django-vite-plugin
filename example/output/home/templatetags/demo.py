from django import template
from django.utils.html import escape

register = template.Library()


@register.tag
def showhtml(parser, token):
    """
    Render the enclosed template code, then output the resulting HTML
    escaped — used by the demo page to display what a tag produced.
    """
    nodelist = parser.parse(('endshowhtml',))
    parser.delete_first_token()
    return ShowHtmlNode(nodelist)


class ShowHtmlNode(template.Node):
    def __init__(self, nodelist):
        self.nodelist = nodelist

    def render(self, context):
        return escape(self.nodelist.render(context).strip())
