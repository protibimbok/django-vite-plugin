"""Manifest loading, lookup and the CSS import graph (audit #4, #17, #18)."""

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest
from django.template import Context

SRC = Path(__file__).resolve().parents[1] / "src"


def test_entry_is_returned(plugin, manifest):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin()
    p.utils  # importing is what loads the manifest
    assert p.manifest.get_manifest_entry("js/app.js") == {"file": "assets/app-1234.js"}


def test_missing_entry_names_the_asset(plugin, manifest):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin()
    p.utils
    with pytest.raises(RuntimeError, match="Cannot find js/other.js in Vite manifest"):
        p.manifest.get_manifest_entry("js/other.js")


def test_missing_manifest_is_reported_at_the_failing_lookup(plugin, capsys):
    p = plugin()
    p.utils  # importing is what loads the manifest
    assert "the Vite manifest was not found" in capsys.readouterr().err

    with pytest.raises(RuntimeError) as excinfo:
        p.manifest.get_manifest_entry("js/app.js")

    message = str(excinfo.value)
    assert "Cannot resolve js/app.js" in message
    assert "manifest.json" in message
    assert "Run the Vite build" in message


def test_a_later_successful_load_clears_the_error(plugin, manifest):
    p = plugin()
    p.utils
    assert p.cache.VITE_MANIFEST[2] is not None

    path = manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p.manifest.load_manifest(path)

    assert p.cache.VITE_MANIFEST[2] is None
    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-1234.js"


def test_clearing_the_caches_leaves_the_manifest_usable(plugin, manifest):
    # It used to empty VITE_MANIFEST with nothing left to refill it, so every
    # lookup afterwards failed as 'Cannot find X in Vite manifest'
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin()
    p.utils

    p.cache.clear_caches()

    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-1234.js"


def test_clearing_the_caches_picks_up_a_rebuild(plugin, manifest):
    manifest({"js/app.js": {"file": "assets/app-old.js"}})
    p = plugin()
    p.utils

    manifest({"js/app.js": {"file": "assets/app-new.js"}})
    p.cache.clear_caches()

    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-new.js"


def test_a_rebuild_is_picked_up_without_clearing_anything(plugin, manifest):
    """Previewing a build means rebuilding under a server that keeps running."""
    manifest({"js/app.js": {"file": "assets/app-old.js"}})
    p = plugin(DEBUG=True, DJANGO_VITE_PLUGIN={"DEV_MODE": False})
    p.utils
    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-old.js"

    manifest({"js/app.js": {"file": "assets/app-new.js"}})

    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-new.js"


def test_a_rebuild_that_only_renamed_things_is_picked_up_too(plugin, manifest):
    """Every name keeps its length, so the size alone would not give it away."""
    manifest({"js/app.js": {"file": "assets/app-1111.js"}})
    p = plugin(DEBUG=True, DJANGO_VITE_PLUGIN={"DEV_MODE": False})
    p.utils
    p.manifest.get_manifest_entry("js/app.js")

    path = manifest({"js/app.js": {"file": "assets/app-2222.js"}})
    os.utime(path, (0, 0))

    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-2222.js"


def test_a_rebuild_inside_one_float_tick_is_picked_up(plugin, manifest):
    """`st_mtime` is a float. At epoch scale it cannot resolve much under a
    microsecond, so two writes that close compare equal and the rebuild is
    missed unless the exact stamp is what gets compared."""
    path = manifest({"js/app.js": {"file": "assets/app-1111.js"}})
    stamp = 1_700_000_000_000_000_000
    os.utime(path, ns=(stamp, stamp))
    p = plugin(DEBUG=True, DJANGO_VITE_PLUGIN={"DEV_MODE": False})
    p.utils
    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-1111.js"

    path = manifest({"js/app.js": {"file": "assets/app-2222.js"}})
    os.utime(path, ns=(stamp + 100, stamp + 100))

    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-2222.js"


def test_a_build_that_arrives_late_is_picked_up(plugin, manifest):
    p = plugin(DEBUG=True, DJANGO_VITE_PLUGIN={"DEV_MODE": False})
    p.utils
    with pytest.raises(RuntimeError, match="Cannot resolve"):
        p.manifest.get_manifest_entry("js/app.js")

    manifest({"js/app.js": {"file": "assets/app-1234.js"}})

    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-1234.js"
    assert p.cache.VITE_MANIFEST[2] is None


def test_an_unchanged_manifest_is_not_read_again(plugin, manifest):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin()
    p.utils

    loads = []
    real = p.manifest.load_manifest
    p.manifest.load_manifest = lambda path: loads.append(path) or real(path)
    try:
        for _ in range(3):
            p.manifest.get_manifest_entry("js/app.js")
    finally:
        p.manifest.load_manifest = real

    assert loads == []


def test_a_reload_drops_entries_the_new_manifest_no_longer_has(plugin, manifest):
    manifest({"a.js": {"file": "a.js"}, "gone.js": {"file": "gone.js"}})
    p = plugin()
    p.utils

    manifest({"a.js": {"file": "a.js"}})
    p.cache.clear_caches()

    p.manifest.get_manifest_entry("a.js")
    with pytest.raises(RuntimeError, match="Cannot find gone.js in Vite manifest"):
        p.manifest.get_manifest_entry("gone.js")


def test_a_missing_manifest_is_not_reread_on_every_lookup(plugin, capsys):
    # The reread is guarded, so a broken deployment reports itself once rather
    # than opening the file and writing to stderr per rendered tag
    p = plugin()
    p.utils
    capsys.readouterr()

    for _ in range(3):
        with pytest.raises(RuntimeError):
            p.manifest.get_manifest_entry("js/app.js")

    assert capsys.readouterr().err == ""


def test_unreadable_manifest_raises(plugin, manifest):
    path = manifest({"js/app.js": {}})
    path.write_text("{not json", encoding="utf-8")
    p = plugin()
    with pytest.raises(RuntimeError, match="Cannot read Vite manifest file"):
        p.manifest.load_manifest(path)


def test_a_manifest_that_is_not_an_object_raises(plugin, manifest):
    path = manifest({"js/app.js": {}})
    path.write_text('["js/app.js"]', encoding="utf-8")
    p = plugin()
    with pytest.raises(RuntimeError, match="not a JSON object"):
        p.manifest.load_manifest(path)


def test_a_deleted_manifest_stops_the_old_filenames(plugin, manifest):
    # The entries used to survive the failed reread, so the server kept
    # rendering a build that was no longer on disk
    path = manifest({"js/app.js": {"file": "assets/app-old.js"}})
    p = plugin(DEBUG=True, DJANGO_VITE_PLUGIN={"DEV_MODE": False})
    p.utils
    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-old.js"

    path.unlink()

    with pytest.raises(RuntimeError, match="Run the Vite build"):
        p.manifest.get_manifest_entry("js/app.js")


def test_a_corrupt_manifest_keeps_reporting_itself(plugin, manifest):
    # A rebuild truncates the file before it writes it. The read used to fail
    # once, having already recorded the new signature, and every lookup after
    # that quietly answered from the previous build
    path = manifest({"js/app.js": {"file": "assets/app-old.js"}})
    p = plugin(DEBUG=True, DJANGO_VITE_PLUGIN={"DEV_MODE": False})
    p.utils
    p.manifest.get_manifest_entry("js/app.js")

    path.write_text("{not json", encoding="utf-8")

    with pytest.raises(RuntimeError, match="Cannot read Vite manifest file"):
        p.manifest.get_manifest_entry("js/app.js")
    with pytest.raises(RuntimeError, match="could not be read"):
        p.manifest.get_manifest_entry("js/app.js")


def test_a_production_render_does_not_stat_the_manifest(plugin, manifest):
    """DEBUG off is a deployment: nothing rebuilds under the running server, so
    nothing may pay a syscall per render to notice that it did."""
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin(DEBUG=False)
    p.utils

    seen = []
    real = os.stat
    os.stat = lambda path, *a, **kw: seen.append(str(path)) or real(path, *a, **kw)
    try:
        for _ in range(3):
            p.manifest.get_manifest_entry("js/app.js")
    finally:
        os.stat = real

    assert [s for s in seen if "manifest.json" in s] == []


def test_clearing_the_caches_refills_them_even_with_debug_off(plugin, manifest):
    """`clear_caches()` is the supported way to pick up a rebuild, and it is
    the one that must keep working where the stat is not paid."""
    manifest({"js/app.js": {"file": "assets/app-old.js"}})
    p = plugin(DEBUG=False)
    p.utils

    manifest({"js/app.js": {"file": "assets/app-new.js"}})
    p.cache.clear_caches()

    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-new.js"


def test_a_reload_replaces_the_manifest_rather_than_emptying_it(plugin, manifest):
    # It used to clear the dict and refill it, so a render on another thread
    # could land in the gap and fail as 'Cannot find X in Vite manifest'
    manifest({"js/app.js": {"file": "assets/app-old.js"}})
    p = plugin(DEBUG=True, DJANGO_VITE_PLUGIN={"DEV_MODE": False})
    p.utils
    before = p.cache.VITE_MANIFEST[1]

    manifest({"js/app.js": {"file": "assets/app-new.js"}})
    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-new.js"

    assert p.cache.VITE_MANIFEST[1] is not before
    # Whoever was holding the old one still has a whole build, not an empty dict
    assert before == {"js/app.js": {"file": "assets/app-old.js"}}


def test_manifest_is_read_as_utf8_under_a_non_utf8_locale(tmp_path):
    """The locale encoding must not decide how the manifest is read (#17)."""
    manifest_path = tmp_path / "manifest.json"
    manifest_path.write_text(
        # Vite writes the manifest as raw UTF-8, the way `JSON.stringify` does.
        json.dumps(
            {"café/entrée.js": {"file": "assets/café-1234.js"}},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    # The driver stays pure ASCII: the point is what the *manifest* bytes
    # decode to, and a non-ASCII argv cannot survive an ASCII locale anyway.
    driver = textwrap.dedent(
        f"""
        import locale
        import sys
        sys.path.insert(0, {str(SRC)!r})
        from django.conf import settings
        settings.configure(BASE_DIR={str(tmp_path)!r}, INSTALLED_APPS=[])
        import django; django.setup()
        from django_vite_plugin.manifest import load_manifest, get_manifest_entry
        load_manifest({str(manifest_path)!r})
        entry = get_manifest_entry("caf\\u00e9/entr\\u00e9e.js")
        print(
            locale.getpreferredencoding(False),
            entry["file"] == "assets/caf\\u00e9-1234.js",
        )
        """
    )
    driver_path = tmp_path / "driver.py"
    driver_path.write_text(driver, encoding="utf-8")
    env = {
        **os.environ,
        "LC_ALL": "C",
        "LANG": "C",
        "PYTHONUTF8": "0",
        "PYTHONCOERCECLOCALE": "0",
        "PYTHONIOENCODING": "utf-8",
    }
    result = subprocess.run(
        [sys.executable, str(driver_path)],
        capture_output=True,
        text=True,
        env=env,
    )

    assert result.returncode == 0, result.stderr
    locale_encoding, decoded_correctly = result.stdout.split()
    assert "utf" not in locale_encoding.lower(), "the child needs a non-UTF-8 locale"
    assert decoded_correctly == "True"


def test_css_of_an_entry_is_emitted_before_the_script(plugin, manifest):
    manifest(
        {
            "js/app.js": {"file": "assets/app.js", "css": ["assets/app.css"]},
        }
    )
    p = plugin()
    html = p.utils.get_from_manifest("js/app.js", p.attrs())
    assert html.index("app.css") < html.index("app.js")


def test_a_stylesheet_is_linked_whatever_the_build_named_it(plugin, manifest):
    """`assetFileNames` without `[extname]` made a <script> of a stylesheet."""
    manifest(
        {
            "js/app.js": {"file": "assets/app.js", "css": ["css/app"]},
            "css/app.scss": {"file": "css/app"},
        }
    )
    p = plugin()

    assert p.utils.get_from_manifest("js/app.js", p.attrs()) == (
        '<link rel="stylesheet" type="text/css" href="/static/css/app" />'
        '<script type="module" src="/static/assets/app.js"></script>'
    )
    assert p.utils.get_from_manifest("css/app.scss", p.attrs()) == (
        '<link rel="stylesheet" type="text/css" href="/static/css/app" />'
    )


@pytest.mark.parametrize(
    "shape,expected",
    [
        pytest.param(
            {
                "a.js": {"file": "a.js", "imports": ["b.js"], "css": ["a.css"]},
                "b.js": {"file": "b.js", "imports": ["a.js"], "css": ["b.css"]},
            },
            ["a.css", "b.css"],
            id="a -> b -> a",
        ),
        pytest.param(
            {"a.js": {"file": "a.js", "imports": ["a.js"], "css": ["a.css"]}},
            ["a.css"],
            id="self import",
        ),
        pytest.param(
            {
                "a.js": {"file": "a.js", "imports": ["b.js", "c.js"]},
                "b.js": {"file": "b.js", "imports": ["d.js"], "css": ["b.css"]},
                "c.js": {"file": "c.js", "imports": ["d.js"], "css": ["c.css"]},
                "d.js": {"file": "d.js", "css": ["shared.css"]},
            },
            ["shared.css", "b.css", "c.css"],
            id="diamond emits shared css once",
        ),
    ],
)
def test_cyclic_and_shared_imports_terminate(plugin, manifest, shape, expected):
    manifest(shape)
    p = plugin()
    html = p.utils.get_from_manifest("a.js", p.attrs())

    hrefs = [
        part.split('"')[0]
        for part in html.split('href="')[1:]
    ]
    assert [href.rsplit("/", 1)[-1] for href in hrefs] == expected


def test_one_tag_emits_a_shared_stylesheet_once(plugin, manifest):
    # The dedup used to last one entry, so two entries over the same chunk
    # each brought its stylesheet along
    manifest(
        {
            "_shared.js": {"file": "shared.js", "css": ["shared.css"]},
            "a.js": {"file": "a.js", "imports": ["_shared.js"]},
            "b.js": {"file": "b.js", "imports": ["_shared.js"]},
        }
    )
    p = plugin()
    html = p.module("templatetags.utils").make_template_assets(
        ["a.js", "b.js"], p.attrs()
    )

    assert html.count('href="/static/shared.css"') == 1
    assert html.count('src="/static/a.js"') == 1
    assert html.count('src="/static/b.js"') == 1


def test_separate_tags_still_stand_on_their_own(plugin, manifest):
    # Deduping across tags would mean giving up the parsed node's cached HTML,
    # so each tag starts over - the browser loads the stylesheet once either way
    manifest(
        {
            "_shared.js": {"file": "shared.js", "css": ["shared.css"]},
            "a.js": {"file": "a.js", "imports": ["_shared.js"]},
        }
    )
    p = plugin()
    render = p.module("templatetags.utils").make_template_assets
    html = render(["a.js"], p.attrs()) + render(["a.js"], p.attrs())

    assert html.count('href="/static/shared.css"') == 2


def test_dangling_import_names_the_missing_entry(plugin, manifest):
    manifest({"a.js": {"file": "a.js", "imports": ["nope.js"]}})
    p = plugin()
    with pytest.raises(RuntimeError, match="Cannot find nope.js in Vite manifest"):
        p.utils.get_from_manifest("a.js", p.attrs())


def test_a_rebuild_landing_while_a_request_is_in_flight(plugin, manifest, racing):
    """The signature used to be stamped before the entries it was taken for, so
    a reader arriving in between was handed the new signature over the old
    entries - and cached them as current, leaving the build frozen for good."""
    manifest({"js/app.js": {"file": "assets/app-old.js"}})
    p = plugin(DEBUG=True, DJANGO_VITE_PLUGIN={"DEV_MODE": False, "STATIC_LOOKUP": False})
    template = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")
    template.render(Context())

    manifest({"js/app.js": {"file": "assets/app-new.js"}})

    first, second = racing(
        lambda: template.render(Context()), p.manifest.json, "load"
    )

    for answer in (first, second):
        assert "app-new.js" in answer, answer
    assert "app-new.js" in template.render(Context())


def test_a_cold_node_serving_two_requests_at_once(plugin, manifest, racing):
    """`MANIFEST_LOADED` was set before the entries landed, so the second
    reader was told the manifest was loaded and found nothing in it."""
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin(DJANGO_VITE_PLUGIN={"DEV_MODE": False, "STATIC_LOOKUP": False})
    p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}").render(Context())

    p.cache.clear_caches()

    def compile_and_render():
        template = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")
        return template.render(Context())

    first, second = racing(compile_and_render, p.manifest.json, "load")

    for answer in (first, second):
        assert "app-1234.js" in answer, answer
