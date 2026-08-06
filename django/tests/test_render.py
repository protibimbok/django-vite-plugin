"""What `{% vite %}` renders: escaping, dev vs build, and thread safety.

Covers audit #2 (cross-request attribute leak), #3 (HTML escaping) and #14
(malformed tags).
"""

import threading

import pytest
from django.template import Context, TemplateSyntaxError
from django.utils.safestring import SafeString, mark_safe


def render(p, template, **context):
    return p.engine().from_string("{% load vite %}" + template).render(Context(context))


def test_dev_mode_points_at_the_dev_server(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" src="http://localhost:5173/js/app.js"></script>'
    )


def test_dev_mode_emits_a_link_for_stylesheets(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'css/app.scss' %}") == (
        '<link rel="stylesheet" type="text/css" '
        'href="http://localhost:5173/css/app.scss" />'
    )


def test_an_empty_tag_loads_the_dev_client(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite %}") == (
        '<script type="module" src="http://localhost:5173/@vite/client"></script>'
    )


def test_build_mode_resolves_through_the_manifest(plugin, manifest):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin()
    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" src="/static/assets/app-1234.js"></script>'
    )


def test_a_missing_dev_server_is_reported(plugin):
    p = plugin(DEBUG=True)
    with pytest.raises(Exception, match="Vite dev server is not started"):
        render(p, "{% vite 'js/app.js' %}")


def test_clear_caches_forgets_the_dev_server(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    render(p, "{% vite 'js/app.js' %}")
    assert p.cache.DEV_SERVER == "http://localhost:5173"

    hot_file("http://localhost:4000")
    p.cache.clear_caches()

    assert p.cache.DEV_SERVER is None
    assert "http://localhost:4000" in render(p, "{% vite 'js/app.js' %}")


@pytest.mark.parametrize("debug", [True, False], ids=["dev", "build"])
def test_attribute_values_are_escaped(plugin, manifest, hot_file, debug):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=debug)

    html = render(p, "{% vite 'js/app.js' data-x=val %}", val='" onload="alert(1)')

    assert 'onload="alert(1)"' not in html
    assert "&quot; onload=&quot;alert(1)" in html


@pytest.mark.parametrize("debug", [True, False], ids=["dev", "build"])
def test_asset_urls_are_escaped(plugin, manifest, hot_file, debug):
    manifest({'js/"><script>.js': {"file": 'assets/"><script>.js'}})
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=debug)

    html = render(p, "{% vite path %}", path='js/"><script>.js')

    assert "><script>" not in html.replace("<script ", "")
    assert "&quot;&gt;&lt;script&gt;" in html


def test_safe_strings_pass_through_unescaped(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)

    escaped = render(p, "{% vite 'js/app.js' data-x=val %}", val="a&b")
    safe = render(p, "{% vite 'js/app.js' data-x=val %}", val=mark_safe("a&b"))

    assert 'data-x="a&amp;b"' in escaped
    assert 'data-x="a&b"' in safe


def test_make_attrs_returns_a_safe_string(plugin):
    p = plugin()
    assert isinstance(p.utils.make_attrs({"defer": True}), SafeString)
    assert p.utils.make_attrs({"defer": True, "crossorigin": False}) == (
        'defer crossorigin="false"'
    )


def test_attributes_override_the_defaults(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    html = render(p, "{% vite 'js/app.js' type='text/babel' %}")
    assert 'type="text/babel"' in html
    assert 'type="module"' not in html


def test_dynamic_attributes_do_not_leak_between_renders(plugin, hot_file):
    """A node is shared by every request; resolved attributes must not be (#2)."""
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    template = p.engine().from_string(
        "{% load vite %}{% vite 'js/app.js' data-x=val %}"
    )
    node = template.nodelist[1]

    leaks = []

    def render_many(value):
        for _ in range(300):
            html = template.render(Context({"val": value}))
            if f'data-x="{value}"' not in html:
                leaks.append(html)

    threads = [
        threading.Thread(target=render_many, args=(f"thread-{i}",)) for i in range(8)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert leaks == []
    assert node.attrs is None


@pytest.mark.parametrize(
    "tag,message",
    [
        ("{% vite 'app.js' key= %}", "attribute without a value"),
        ("{% vite 'app.js' =val %}", "attribute without a name"),
        ('{% vite "app.js %}', "unterminated string"),
        ("{% vite \"app.js' %}", "unterminated string"),
        ("{% vite 'app.js' key='v %}", "unterminated string"),
    ],
)
def test_malformed_tags_fail_at_compile_time(plugin, tag, message):
    p = plugin(DEBUG=True)
    with pytest.raises(TemplateSyntaxError, match=message):
        p.engine().from_string("{% load vite %}" + tag)


def test_a_quoted_argument_is_a_path_even_with_an_equals_sign(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'a=b.js' %}") == (
        '<script type="module" src="http://localhost:5173/a=b.js"></script>'
    )
