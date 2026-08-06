"""Manifest loading, lookup and the CSS import graph (audit #4, #17, #18)."""

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

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
    assert p.cache.MANIFEST_ERROR is not None

    path = manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p.manifest.load_manifest(path)

    assert p.cache.MANIFEST_ERROR is None
    assert p.manifest.get_manifest_entry("js/app.js")["file"] == "assets/app-1234.js"


def test_unreadable_manifest_raises(plugin, manifest):
    path = manifest({"js/app.js": {}})
    path.write_text("{not json", encoding="utf-8")
    p = plugin()
    with pytest.raises(RuntimeError, match="Cannot read Vite manifest file"):
        p.manifest.load_manifest(path)


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


def test_dangling_import_names_the_missing_entry(plugin, manifest):
    manifest({"a.js": {"file": "a.js", "imports": ["nope.js"]}})
    p = plugin()
    with pytest.raises(RuntimeError, match="Cannot find nope.js in Vite manifest"):
        p.utils.get_from_manifest("a.js", p.attrs())
