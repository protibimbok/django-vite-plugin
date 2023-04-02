from django.conf import settings
from django import template
from html import escape

register = template.Library()


@register.tag
def html(parser, token):
    nodelist = parser.parse(('endhtml',))
    
    parser.delete_first_token()
    
    return HtmlNode(nodelist)


class HtmlNode(template.Node):
    def __init__(self, nodelist):
        self.nodelist = nodelist

    def render(self, context):
        return escape(self.nodelist.render(context))
    
