"""Resolving an asset path through Django's static finders (audit #5)."""


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


def test_static_lookup_off_returns_the_argument(plugin, tmp_path):
    base = tmp_path / "project"
    write(base / "static" / "js" / "app.js")
    p = plugin(
        BASE_DIR=base,
        STATICFILES_DIRS=[base / "static"],
        DJANGO_VITE_PLUGIN={"STATIC_LOOKUP": False},
    )

    assert p.utils.find_asset("js/app.js") == "js/app.js"


def test_a_resolved_asset_is_cached(plugin, tmp_path):
    base = tmp_path / "project"
    write(base / "static" / "js" / "app.js")
    p = plugin(BASE_DIR=base, STATICFILES_DIRS=[base / "static"])

    p.utils.find_asset("js/app.js")
    assert p.cache.FOUND_FILES_CACHE == {"js/app.js": "static/js/app.js"}

    p.cache.clear_caches()
    assert p.cache.FOUND_FILES_CACHE == {}
