"""Shared setup for the django_vite_plugin tests.

The plugin reads settings at *import* time - `utils.CONFIG`, the manifest load,
`urls.urlpatterns` - so a test that needs a different settings shape needs a
fresh copy of the package under those settings. The `plugin` fixture gives it
one: it applies the overrides, drops every `django_vite_plugin` module from
`sys.modules`, and hands back an object that imports them on attribute access.
"""

import importlib
import sys
from contextlib import ExitStack
from pathlib import Path

import django
import pytest
from django.conf import settings
from django.template import Engine

SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


def pytest_configure():
    settings.configure(
        DEBUG=False,
        BASE_DIR=Path(__file__).resolve().parent,
        INSTALLED_APPS=["django.contrib.staticfiles"],
        STATIC_URL="/static/",
        USE_TZ=True,
    )
    django.setup()


def _purge_plugin_modules():
    for name in [
        name
        for name in sys.modules
        if name == "django_vite_plugin" or name.startswith("django_vite_plugin.")
    ]:
        del sys.modules[name]


class _Plugin:
    """Lazily imports `django_vite_plugin.<name>` on attribute access."""

    def __getattr__(self, name):
        return importlib.import_module(f"django_vite_plugin.{name}")

    def module(self, path):
        return importlib.import_module(f"django_vite_plugin.{path}")

    def attrs(self, **overrides):
        """The `{'js': ..., 'css': ...}` pair the render helpers take."""
        return self.module("templatetags.utils").make_template_attrs(overrides)

    @staticmethod
    def engine(**kwargs):
        """A template engine bound to this copy of the `vite` tag."""
        return Engine(
            libraries={"vite": "django_vite_plugin.templatetags.vite"},
            **kwargs,
        )


@pytest.fixture
def plugin(tmp_path):
    """Factory: `plugin(**settings_overrides)` -> a fresh copy of the package.

    `BASE_DIR` defaults to the test's own tmp_path, so nothing a test writes
    can reach another one.
    """
    from django.contrib.staticfiles import finders

    stack = ExitStack()

    def load(**overrides):
        from django.test import override_settings

        overrides.setdefault("BASE_DIR", tmp_path)
        stack.enter_context(override_settings(**overrides))
        _purge_plugin_modules()
        finders.get_finder.cache_clear()
        return _Plugin()

    try:
        yield load
    finally:
        stack.close()
        _purge_plugin_modules()
        finders.get_finder.cache_clear()


@pytest.fixture
def manifest(tmp_path):
    """Writes a manifest where the plugin looks for one by default."""

    def write(entries, encoding="utf-8"):
        import json

        path = tmp_path / "static" / ".vite" / "manifest.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(entries, ensure_ascii=False), encoding=encoding)
        return path

    return write


@pytest.fixture
def hot_file(tmp_path):
    """Writes the hot file the dev-mode code path reads."""

    def write(url="http://localhost:5173"):
        path = tmp_path / ".hotfile"
        path.write_text(url, encoding="utf-8")
        return path

    return write
