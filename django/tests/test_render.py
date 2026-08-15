"""What `{% vite %}` renders: escaping, dev vs build, and thread safety.

Covers audit #2 (cross-request attribute leak), #3 (HTML escaping) and #14
(malformed tags).
"""

import os
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


@pytest.mark.parametrize(
    "ext",
    # Every extension Vite's own CSS_LANGS_RE compiles as a stylesheet. A
    # <script> tag for any of them is served as text/css and the browser
    # refuses it on the MIME mismatch, so the styles silently never load.
    ["css", "less", "sass", "scss", "styl", "stylus", "pcss", "postcss", "sss"],
)
def test_dev_mode_emits_a_link_for_stylesheets(plugin, hot_file, ext):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'css/app." + ext + "' %}") == (
        '<link rel="stylesheet" type="text/css" '
        f'href="http://localhost:5173/css/app.{ext}" />'
    )


@pytest.mark.parametrize(
    "query",
    ["?used", "?direct", "?raw", "?t=1700000000000", ""],
)
def test_a_query_does_not_make_a_stylesheet_a_script(plugin, hot_file, query):
    """Vite's own CSS_LANGS_RE ends `(?:$|\\?)`; `endswith` could only match
    the `$` half, so any query turned the <link> into a <script>."""
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'css/app.scss" + query + "' %}") == (
        '<link rel="stylesheet" type="text/css" '
        f'href="http://localhost:5173/css/app.scss{query}" />'
    )


def test_a_query_does_not_make_a_script_a_stylesheet(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'js/app.js?worker' %}") == (
        '<script type="module" '
        'src="http://localhost:5173/js/app.js?worker"></script>'
    )


def test_a_css_lookalike_in_the_path_is_not_a_stylesheet(plugin, hot_file):
    """The extension has to end the path or meet a query, not merely appear."""
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'app.css.js' %}") == (
        '<script type="module" src="http://localhost:5173/app.css.js"></script>'
    )


def test_a_hand_written_hot_file_may_end_with_a_newline(plugin, hot_file):
    """`echo url > .hotfile` in a Docker entrypoint must not break every URL."""
    hot_file("http://localhost:5173\n")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" src="http://localhost:5173/js/app.js"></script>'
    )


def test_an_empty_tag_loads_the_dev_client(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite %}") == (
        '<script type="module" src="http://localhost:5173/@vite/client"></script>'
    )


def test_an_ipv6_dev_server_url_renders_intact(plugin, hot_file):
    """The plugin writes IPv6 hosts bracketed; the brackets must survive
    escaping and reach the browser as a loadable URL."""
    hot_file("http://[::1]:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" src="http://[::1]:5173/js/app.js"></script>'
    )
    assert render(p, "{% vite 'css/app.css' %}") == (
        '<link rel="stylesheet" type="text/css" '
        'href="http://[::1]:5173/css/app.css" />'
    )


def test_an_asset_outside_base_dir_is_served_through_vites_fs_route(plugin, tmp_path):
    """A '../' URL is normalised away by the browser before it is sent, so it
    would reach Vite as a path under its root and 404."""
    shared = tmp_path / "shared_assets"
    (shared / "lib").mkdir(parents=True)
    (shared / "lib" / "x.js").write_text("", encoding="utf-8")
    (shared / "lib" / "x.css").write_text("", encoding="utf-8")
    base = tmp_path / "project"
    base.mkdir()
    (base / ".hotfile").write_text("http://localhost:5173", encoding="utf-8")
    p = plugin(DEBUG=True, BASE_DIR=base, STATICFILES_DIRS=[shared])

    prefix = f"http://localhost:5173/@fs/{shared.as_posix().lstrip('/')}"
    assert f'src="{prefix}/lib/x.js"' in render(p, "{% vite 'lib/x.js' %}")
    assert f'href="{prefix}/lib/x.css"' in render(p, "{% vite 'lib/x.css' %}")


def test_an_asset_inside_base_dir_keeps_a_plain_url(plugin, hot_file, tmp_path):
    (tmp_path / "static" / "js").mkdir(parents=True)
    (tmp_path / "static" / "js" / "app.js").write_text("", encoding="utf-8")
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True, STATICFILES_DIRS=[tmp_path / "static"])

    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" '
        'src="http://localhost:5173/static/js/app.js"></script>'
    )


def test_a_parsed_template_notices_a_vite_restart(plugin, hot_file):
    """Vite moves to the next free port on restart; Django caches parsed
    templates, so the old URL must not be baked into them."""
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    template = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")
    assert "http://localhost:5173/js/app.js" in template.render(Context())

    path = hot_file("http://localhost:5174")
    stat = path.stat()
    os.utime(path, (stat.st_atime, stat.st_mtime + 10))

    assert "http://localhost:5174/js/app.js" in template.render(Context())


@pytest.mark.parametrize(
    "restarted_to",
    [
        pytest.param("https://localhost:5173", id="a url of another length"),
        pytest.param("http://localhost:5174", id="the next free port"),
    ],
)
def test_a_restart_within_one_timestamp_tick_is_noticed_too(
    plugin, hot_file, restarted_to
):
    """A filesystem that stamps mtime by the second gives the restart the time
    the previous server already had. Vite moves to the next free port, which
    is a URL of exactly the same length, so a size cannot tell them apart
    either - which is why the hot file is read rather than cached."""
    path = hot_file("http://localhost:5173")
    os.utime(path, (0, 0))
    p = plugin(DEBUG=True)
    template = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")
    assert "http://localhost:5173/js/app.js" in template.render(Context())

    hot_file(restarted_to)
    os.utime(path, (0, 0))

    assert f"{restarted_to}/js/app.js" in template.render(Context())


def test_a_parsed_template_picks_up_a_file_created_later(plugin, hot_file, tmp_path):
    """`find_asset` re-resolves a miss, but the tag used to bake the unresolved
    URL into the parsed node, which Django caches for the process lifetime."""
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True, STATICFILES_DIRS=[tmp_path / "static"])
    template = p.engine().from_string("{% load vite %}{% vite 'js/late.js' %}")
    assert 'src="http://localhost:5173/js/late.js"' in template.render(Context())

    (tmp_path / "static" / "js").mkdir(parents=True)
    (tmp_path / "static" / "js" / "late.js").write_text("", encoding="utf-8")

    html = template.render(Context())
    assert 'src="http://localhost:5173/static/js/late.js"' in html


def test_a_found_path_is_still_baked_in_by_build_mode(plugin, manifest, tmp_path):
    """Re-resolving must not cost every build-mode render a finders lookup."""
    (tmp_path / "static" / "js").mkdir(parents=True)
    (tmp_path / "static" / "js" / "app.js").write_text("", encoding="utf-8")
    manifest({"static/js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin(STATICFILES_DIRS=[tmp_path / "static"])

    template = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")

    assert template.nodelist[1].html == (
        '<script type="module" src="/static/assets/app-1234.js"></script>'
    )


def test_a_stopped_dev_server_is_noticed(plugin, hot_file):
    """Removing the hot file must raise, not keep serving the dead URL."""
    path = hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    template = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")
    template.render(Context())

    path.unlink()
    with pytest.raises(Exception, match="Vite dev server is not started"):
        template.render(Context())


def test_build_mode_resolves_through_the_manifest(plugin, manifest):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin()
    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" src="/static/assets/app-1234.js"></script>'
    )


def test_build_mode_renders_a_relative_prefix_as_an_absolute_url(plugin, manifest):
    """Otherwise the URL is read against whatever page happens to name the asset."""
    manifest(
        {
            "js/app.js": {
                "file": "assets/app-1234.js",
                "css": ["assets/app-1234.css"],
            }
        }
    )
    p = plugin(
        STATIC_URL=None,
        DJANGO_VITE_PLUGIN={"DEV_MODE": False, "BUILD_URL_PREFIX": "assets"},
    )
    assert render(p, "{% vite 'js/app.js' %}") == (
        '<link rel="stylesheet" type="text/css" href="/assets/assets/app-1234.css" />'
        '<script type="module" src="/assets/assets/app-1234.js"></script>'
    )


def test_build_mode_leaves_a_prefix_on_another_host_alone(plugin, manifest):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin(
        STATIC_URL=None,
        DJANGO_VITE_PLUGIN={
            "DEV_MODE": False,
            "BUILD_URL_PREFIX": "https://cdn.example.com/x",
        },
    )
    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" '
        'src="https://cdn.example.com/x/assets/app-1234.js"></script>'
    )


def test_build_mode_renders_the_rebuild_rather_than_the_build_before_it(
    plugin, manifest
):
    manifest({"js/app.js": {"file": "assets/app-old.js"}})
    p = plugin()
    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" src="/static/assets/app-old.js"></script>'
    )

    manifest({"js/app.js": {"file": "assets/app-new.js"}})

    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" src="/static/assets/app-new.js"></script>'
    )


def test_a_parsed_template_renders_the_rebuild_too(plugin, manifest, tmp_path):
    """Django caches parsed templates, so the node outlives the build it read."""
    (tmp_path / "static" / "js").mkdir(parents=True)
    (tmp_path / "static" / "js" / "app.js").write_text("", encoding="utf-8")
    manifest({"static/js/app.js": {"file": "assets/app-old.js"}})
    p = plugin(STATICFILES_DIRS=[tmp_path / "static"])

    template = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")
    assert 'src="/static/assets/app-old.js"' in template.render(Context())

    manifest({"static/js/app.js": {"file": "assets/app-new.js"}})

    assert 'src="/static/assets/app-new.js"' in template.render(Context())


def test_a_parsed_template_renders_the_rebuild_without_the_static_lookup(
    plugin, manifest
):
    """With the lookup off every path is baked, so nothing else would notice."""
    manifest({"js/app.js": {"file": "assets/app-old.js"}})
    p = plugin(DJANGO_VITE_PLUGIN={"DEV_MODE": False, "STATIC_LOOKUP": False})

    template = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")
    assert 'src="/static/assets/app-old.js"' in template.render(Context())

    manifest({"js/app.js": {"file": "assets/app-new.js"}})

    assert 'src="/static/assets/app-new.js"' in template.render(Context())


def test_an_unchanged_manifest_costs_a_parsed_template_nothing(plugin, manifest):
    """The recheck is a stat; rendering the same build must not redo the work."""
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin(DJANGO_VITE_PLUGIN={"DEV_MODE": False, "STATIC_LOOKUP": False})

    template = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")
    template.render(Context())

    entries = []
    node = template.nodelist[1]
    real = p.module("templatetags.utils").make_template_assets
    p.module("templatetags.nodes").make_template_assets = (
        lambda *a: entries.append(a) or real(*a)
    )
    try:
        for _ in range(3):
            template.render(Context())
    finally:
        p.module("templatetags.nodes").make_template_assets = real

    assert entries == []
    assert node.html_signature is not None


def test_js_attrs_build_applies_however_dev_mode_is_spelled_falsy(plugin, manifest):
    """`DEV_MODE: 0` loaded the manifest but skipped JS_ATTRS_BUILD."""
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin(
        DJANGO_VITE_PLUGIN={"DEV_MODE": 0, "JS_ATTRS_BUILD": {"defer": True}}
    )
    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script defer src="/static/assets/app-1234.js"></script>'
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
    assert p.utils.make_attrs({"defer": True, "crossorigin": "anonymous"}) == (
        'defer crossorigin="anonymous"'
    )


@pytest.mark.parametrize("falsy", [False, None])
def test_a_falsy_attribute_is_left_out_rather_than_written_out(plugin, falsy):
    """`crossorigin="false"` is a set crossorigin, and `defer="false"` defers."""
    p = plugin()
    assert p.utils.make_attrs({"defer": True, "crossorigin": falsy}) == "defer"


def test_falsy_is_how_a_default_attribute_is_dropped(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)

    assert render(p, "{% vite 'js/app.js' type=False %}") == (
        '<script src="http://localhost:5173/js/app.js"></script>'
    )
    assert render(p, "{% vite 'js/app.css' rel=None %}") == (
        '<link type="text/css" href="http://localhost:5173/js/app.css" />'
    )


def test_a_tag_with_no_attributes_left_has_no_gap_where_they_were(plugin, hot_file):
    hot_file("http://localhost:5173")
    # An empty JS_ATTRS merges over the defaults rather than replacing them;
    # False is what clears one, in the settings as much as in the tag
    p = plugin(
        DEBUG=True,
        DJANGO_VITE_PLUGIN={
            "JS_ATTRS": {"type": False},
            "CSS_ATTRS": {"rel": False, "type": False},
        },
    )

    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script src="http://localhost:5173/js/app.js"></script>'
    )
    assert render(p, "{% vite 'js/app.css' %}") == (
        '<link href="http://localhost:5173/js/app.css" />'
    )


def test_the_word_false_is_still_available_quoted(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert 'data-x="false"' in render(p, "{% vite 'js/app.js' data-x='false' %}")


def test_an_attribute_resolving_to_false_is_dropped_too(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    html = render(p, "{% vite 'js/app.js' defer=on %}", on=False)
    assert "defer" not in html


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


def test_a_path_may_be_built_by_filters(plugin, hot_file):
    """The form the README documents for a dynamic path."""
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite app|add:'/js/main.js' %}", app="myapp") == (
        '<script type="module" src="http://localhost:5173/myapp/js/main.js"></script>'
    )


def test_a_filter_argument_may_hold_an_equals_sign(plugin, hot_file):
    """Splitting the bit at the first '=' read the filter as an attribute."""
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite app|add:'?v=1' %}", app="js/main.js") == (
        '<script type="module" src="http://localhost:5173/js/main.js?v=1"></script>'
    )


def test_an_attribute_value_may_hold_one_too(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert 'data-x="a=b"' in render(p, "{% vite 'js/app.js' data-x=v|add:'=b' %}", v="a")


def test_filters_apply_to_a_quoted_path_too(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'myapp'|add:'/js/main.js' %}") == (
        '<script type="module" src="http://localhost:5173/myapp/js/main.js"></script>'
    )


def test_a_filter_that_ends_in_no_quote_is_still_a_filter(plugin, hot_file):
    """`'x'|upper` ends on the filter, not on the quote that opened the path."""
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite 'js/app.js'|lower %}") == (
        '<script type="module" src="http://localhost:5173/js/app.js"></script>'
    )
    assert 'data-x="HMR"' in render(p, "{% vite 'js/app.js' data-x='hmr'|upper %}")


def test_a_filter_argument_may_be_quoted_the_other_way(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, """{% vite 'myapp'|add:"/js/main.js" %}""") == (
        '<script type="module" src="http://localhost:5173/myapp/js/main.js"></script>'
    )


def test_an_escaped_quote_belongs_to_the_path(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, r"{% vite 'js/it\'s.js' %}") == (
        '<script type="module" src="http://localhost:5173/js/it&#x27;s.js"></script>'
    )


def test_a_path_that_resolves_to_nothing_renders_nothing(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    assert render(p, "{% vite missing %}") == ""
    assert render(p, "{% vite missing 'js/app.js' %}") == (
        '<script type="module" src="http://localhost:5173/js/app.js"></script>'
    )


def test_string_if_invalid_is_not_mistaken_for_a_path(plugin, hot_file):
    """It stands in for a value to print, never for an asset to go looking for."""
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    engine = p.engine(string_if_invalid="INVALID")

    rendered = engine.from_string("{% load vite %}{% vite missing %}").render(Context())
    assert rendered == ""


def test_an_attribute_value_may_be_built_by_filters(plugin, hot_file):
    hot_file("http://localhost:5173")
    p = plugin(DEBUG=True)
    html = render(p, "{% vite 'js/app.js' data-x=val|upper %}", val="hmr")
    assert 'data-x="HMR"' in html
