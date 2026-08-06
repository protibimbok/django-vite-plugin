"""What the `django_vite_plugin` command hands to the Vite side (audit #19)."""

import importlib
import json
import sys

import pytest
from django.core.management import call_command, get_commands


def make_app(root, dotted_name, label=None):
    """Create an importable app package at `root`, optionally with a label."""
    path = root
    for part in dotted_name.split("."):
        path = path / part
        path.mkdir(parents=True, exist_ok=True)
        (path / "__init__.py").touch()
    if label:
        class_name = "".join(part.title() for part in label.split("_")) + "Config"
        (path / "apps.py").write_text(
            "from django.apps import AppConfig\n\n\n"
            f"class {class_name}(AppConfig):\n"
            f"    name = {dotted_name!r}\n"
            f"    label = {label!r}\n",
            encoding="utf-8",
        )
    return path


APP_ROOTS = {"home", "apps", "thirdparty"}


def _forget_app_modules():
    """Each test builds its apps in its own tmp_path, so nothing may be cached."""
    for name in list(sys.modules):
        if name.split(".")[0] in APP_ROOTS:
            del sys.modules[name]
    importlib.invalidate_caches()


@pytest.fixture
def project(tmp_path, monkeypatch):
    """A project with a flat app, a nested app, a relabelled app and an outsider."""
    base = tmp_path / "project"
    outside = tmp_path / "site-packages"
    make_app(base, "home")
    make_app(base, "apps.blog")
    make_app(base, "apps.shop", label="storefront")
    make_app(outside, "thirdparty")
    monkeypatch.syspath_prepend(str(outside))
    monkeypatch.syspath_prepend(str(base))
    _forget_app_modules()
    try:
        yield base
    finally:
        _forget_app_modules()


def test_only_project_apps_are_sent_keyed_by_label(plugin, project):
    p = plugin(
        BASE_DIR=project,
        INSTALLED_APPS=[
            "django.contrib.staticfiles",
            "django_vite_plugin",
            "home",
            "apps.blog",
            "apps.shop",
            "thirdparty",
        ],
    )

    apps = p.module("management.commands.utils").get_installed_apps()

    assert sorted(apps) == ["blog", "home", "storefront"]
    assert apps["blog"] == str(project / "apps" / "blog")
    assert apps["storefront"] == str(project / "apps" / "shop")


def test_the_config_action_reports_paths_and_apps(plugin, project, capsys):
    p = plugin(
        BASE_DIR=project,
        INSTALLED_APPS=[
            "django.contrib.staticfiles",
            "django_vite_plugin",
            "home",
            "apps.blog",
        ],
        STATIC_URL="/static/",
    )
    p.utils  # the command imports it; do it before capturing output

    get_commands.cache_clear()
    capsys.readouterr()
    call_command("django_vite_plugin", "--action", "config")
    config = json.loads(capsys.readouterr().out)

    assert config["BUILD_URL_PREFIX"] == "/static/"
    assert config["MANIFEST"].endswith("manifest.json")
    assert config["HOT_FILE"] == str(project / ".hotfile")
    assert sorted(config["INSTALLED_APPS"]) == ["blog", "home"]
    assert config["DJANGO_VERSION"]


def test_find_static_resolves_each_argument(plugin, project, capsys):
    static_dir = project / "home" / "static" / "home"
    static_dir.mkdir(parents=True)
    (static_dir / "app.js").write_text("", encoding="utf-8")

    p = plugin(
        BASE_DIR=project,
        INSTALLED_APPS=["django.contrib.staticfiles", "django_vite_plugin", "home"],
    )
    p.utils

    get_commands.cache_clear()
    capsys.readouterr()
    call_command("django_vite_plugin", "--find-static", "home/app.js", "missing.js")
    found = json.loads(capsys.readouterr().out)

    assert found == ["home/static/home/app.js", "missing.js"]
