"""Resolving an asset path through Django's static finders (audit #5)."""

import pytest


def write(path, content=""):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def test_an_in_tree_asset_is_relative_to_base_dir(plugin, tmp_path):
    base = tmp_path / "project"
    write(base / "static" / "js" / "app.js")
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[base / "static"])

    assert p.utils.find_asset("js/app.js") == "static/js/app.js"


def test_an_asset_outside_base_dir_keeps_a_usable_path(plugin, tmp_path):
    base = tmp_path / "project"
    base.mkdir()
    write(tmp_path / "a_much_longer_directory_name" / "pkgapp" / "js" / "x.js")
    p = plugin(
        BASE_DIR=base,
        STATICFILES_DIRS=[tmp_path / "a_much_longer_directory_name"],
    )

    assert p.utils.find_asset("pkgapp/js/x.js") == (
        "../a_much_longer_directory_name/pkgapp/js/x.js"
    )


def test_a_shorter_path_outside_base_dir_is_not_truncated(plugin, tmp_path):
    """Slicing by the length of BASE_DIR used to eat the whole path."""
    base = tmp_path / "a" / "deeply" / "nested" / "project"
    base.mkdir(parents=True)
    write(tmp_path / "s" / "tiny" / "y.js")
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[tmp_path / "s"])

    assert p.utils.find_asset("tiny/y.js") == "../../../../s/tiny/y.js"


def test_an_asset_the_finders_do_not_know_is_passed_through(plugin, tmp_path):
    p = plugin(STATICFILES_DIRS=[])
    assert p.utils.find_asset("/js/app.js") == "js/app.js"


def test_a_leading_separator_is_dropped_before_the_lookup_not_after(plugin, tmp_path):
    """Joined onto a static root it escapes it, and the finders refuse that."""
    base = tmp_path / "project"
    write(base / "static" / "js" / "app.js")
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[base / "static"])

    assert p.utils.find_asset("/js/app.js") == "static/js/app.js"


def test_a_path_that_climbs_out_of_every_root_is_not_found(plugin, tmp_path):
    base = tmp_path / "project"
    write(base / "secret.js")
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[base / "static"])

    assert p.utils.find_asset("../secret.js") == "../secret.js"


def test_an_absolute_path_is_named_relative_to_base_dir(plugin, tmp_path):
    """What `resolve(__dirname, ...)` in vite.config.js hands the finder."""
    base = tmp_path / "project"
    entry = write(base / "frontend" / "src" / "main.ts")
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[base / "static"])

    assert p.utils.find_asset(str(entry)) == "frontend/src/main.ts"


def test_an_absolute_path_outside_base_dir_keeps_a_usable_path(plugin, tmp_path):
    base = tmp_path / "project"
    base.mkdir()
    entry = write(tmp_path / "shared" / "main.ts")
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[])

    assert p.utils.find_asset(str(entry)) == "../shared/main.ts"


def test_a_miss_never_keeps_its_leading_separator(plugin, tmp_path):
    """A URL that starts with '/' swallows BUILD_URL_PREFIX when it is joined."""
    base = tmp_path / "project"
    base.mkdir()
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[])

    assert not p.utils.find_asset("/js/gone.js").startswith(("/", "\\"))


def test_static_lookup_off_returns_the_argument(plugin, tmp_path):
    base = tmp_path / "project"
    write(base / "static" / "js" / "app.js")
    p = plugin(
        BASE_DIR=base,
        STATICFILES_DIRS=[base / "static"],
        DJANGO_VITE_PLUGIN={"STATIC_LOOKUP": False},
    )

    assert p.utils.find_asset("js/app.js") == "js/app.js"


def test_static_lookup_off_still_drops_a_leading_separator(plugin, tmp_path):
    """The lookup is off, but the manifest key and the URL join are not."""
    base = tmp_path / "project"
    base.mkdir()
    p = plugin(BASE_DIR=base, DJANGO_VITE_PLUGIN={"STATIC_LOOKUP": False})

    assert p.utils.find_asset("/src/main.js") == "src/main.js"


def test_static_lookup_off_leaves_a_real_absolute_path_alone(plugin, tmp_path):
    """Vite serves those through /@fs/, which needs the path it was given."""
    base = tmp_path / "project"
    base.mkdir()
    entry = write(tmp_path / "shared" / "main.ts")
    p = plugin(BASE_DIR=base, DJANGO_VITE_PLUGIN={"STATIC_LOOKUP": False})

    assert p.utils.find_asset(str(entry)) == str(entry)


def test_a_miss_is_not_cached_so_a_new_file_is_picked_up(plugin, tmp_path):
    """A file created while the dev server runs must not stay 'missing'."""
    base = tmp_path / "project"
    base.mkdir()
    p = plugin(DEBUG=True, BASE_DIR=base, STATICFILES_DIRS=[base / "static"])

    assert p.utils.find_asset("js/late.js") == "js/late.js"
    assert p.cache.FOUND_FILES_CACHE == {}

    write(base / "static" / "js" / "late.js")
    assert p.utils.find_asset("js/late.js") == "static/js/late.js"


def test_a_miss_is_cached_with_debug_off(plugin, tmp_path, monkeypatch):
    """Nothing appears under a production server, and a permanent miss -
    `{% vite 'react' %}`, a project-level static/ path - would otherwise
    walk the finders on every render."""
    from django.contrib.staticfiles import finders

    base = tmp_path / "project"
    base.mkdir()
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[base / "static"])

    assert p.utils.find_asset("js/late.js") == "js/late.js"
    assert p.cache.FOUND_FILES_CACHE == {"js/late.js": "js/late.js"}
    assert not isinstance(p.utils.resolve_asset("js/late.js"), p.utils.PendingAsset)

    monkeypatch.setattr(finders, "find", lambda *a, **k: pytest.fail("asked again"))
    assert p.utils.find_asset("js/late.js") == "js/late.js"


def test_a_resolved_asset_is_cached(plugin, tmp_path):
    base = tmp_path / "project"
    write(base / "static" / "js" / "app.js")
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[base / "static"])

    p.utils.find_asset("js/app.js")
    assert p.cache.FOUND_FILES_CACHE == {"js/app.js": "static/js/app.js"}

    p.cache.clear_caches()
    assert p.cache.FOUND_FILES_CACHE == {}
