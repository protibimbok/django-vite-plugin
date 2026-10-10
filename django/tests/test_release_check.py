import importlib
import json
import sys
from io import StringIO

import pytest
from django.core import checks
from django.core.management import call_command, get_commands
from django.template import Context


def render(p, template, **context):
    return p.engine().from_string("{% load vite %}" + template).render(Context(context))


@pytest.fixture
def relabelled_app(tmp_path, monkeypatch):
    app = tmp_path / "shop"
    app.mkdir()
    (app / "__init__.py").touch()
    (app / "apps.py").write_text(
        "from django.apps import AppConfig\n\n\n"
        "class ShopConfig(AppConfig):\n"
        "    name = 'shop'\n"
        "    label = 'storefront'\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))
    sys.modules.pop("shop", None)
    sys.modules.pop("shop.apps", None)
    importlib.invalidate_caches()
    try:
        yield app
    finally:
        sys.modules.pop("shop", None)
        sys.modules.pop("shop.apps", None)


def test_issue_43_a_string_base_dir_renders_and_serves_the_build(
    plugin, manifest, tmp_path
):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin(
        DEBUG=True,
        BASE_DIR=str(tmp_path),
        STATIC_URL="/static/",
        DJANGO_VITE_PLUGIN={"DEV_MODE": False},
    )

    assert render(p, "{% vite 'js/app.js' %}") == (
        '<script type="module" src="/static/assets/app-1234.js"></script>'
    )

    [pattern] = p.urls.urlpatterns
    assert pattern.default_args["document_root"] == tmp_path / "static"


def test_issue_84_react_renders_nothing_from_a_build(plugin, manifest):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin(DJANGO_VITE_PLUGIN={"DEV_MODE": False})

    assert render(p, "{% vite 'react' %}") == ""
    assert render(p, "{% vite 'react' 'js/app.js' %}") == (
        '<script type="module" src="/static/assets/app-1234.js"></script>'
    )
    assert render(p, "{% vite entry %}", entry="react") == ""


def test_issue_87_every_built_url_uses_the_build_url_prefix_host(plugin, manifest):
    manifest(
        {
            "js/app.js": {
                "file": "assets/app-1234.js",
                "imports": ["_shared-5678.js"],
                "css": ["assets/app-1234.css"],
            },
            "_shared-5678.js": {
                "file": "assets/shared-5678.js",
                "css": ["assets/shared-5678.css"],
            },
        }
    )
    p = plugin(
        STATIC_URL="/static/",
        DJANGO_VITE_PLUGIN={
            "DEV_MODE": False,
            "BUILD_URL_PREFIX": "https://static.assets.org/",
        },
    )

    html = render(p, "{% vite 'js/app.js' %}")

    assert html == (
        '<link rel="stylesheet" type="text/css" '
        'href="https://static.assets.org/assets/shared-5678.css" />'
        '<link rel="stylesheet" type="text/css" '
        'href="https://static.assets.org/assets/app-1234.css" />'
        '<script type="module" src="https://static.assets.org/assets/app-1234.js">'
        "</script>"
    )
    assert "/static/" not in html.replace("https://static.assets.org/", "")


def test_issue_60_an_app_is_keyed_by_the_label_django_looks_it_up_under(
    plugin, relabelled_app, tmp_path
):
    from django.apps import apps

    p = plugin(
        INSTALLED_APPS=["django.contrib.staticfiles", "django_vite_plugin", "shop"],
    )

    installed = p.module("management.commands._utils").get_installed_apps()

    assert installed == {"storefront": str(relabelled_app)}
    for label in installed:
        assert apps.get_app_config(label).path == installed[label]


def test_issue_40_a_system_check_warning_leaves_stdout_as_json(plugin, tmp_path):
    def warn(app_configs, **kwargs):
        return [checks.Warning("a system check warning", id="release.W001")]

    checks.register(warn)
    try:
        p = plugin(
            INSTALLED_APPS=["django.contrib.staticfiles", "django_vite_plugin"],
            STATIC_URL="/static/",
            DJANGO_VITE_PLUGIN={"DEV_MODE": True},
        )
        p.utils
        get_commands.cache_clear()
        stdout, stderr = StringIO(), StringIO()
        call_command(
            "django_vite_plugin",
            "--action",
            "config",
            stdout=stdout,
            stderr=stderr,
            skip_checks=False,
        )
    finally:
        checks.registry.registry.registered_checks.discard(warn)

    assert "release.W001" in stderr.getvalue()
    assert json.loads(stdout.getvalue())["BASE_DIR"] == str(tmp_path)


def test_issue_18_the_config_action_works_before_the_first_build(
    plugin, tmp_path, capsys
):
    p = plugin(
        INSTALLED_APPS=["django.contrib.staticfiles", "django_vite_plugin"],
        STATIC_URL="/static/",
        DJANGO_VITE_PLUGIN={"DEV_MODE": False},
    )
    assert not (tmp_path / "static" / ".vite" / "manifest.json").exists()

    p.utils
    get_commands.cache_clear()
    capsys.readouterr()
    stdout = StringIO()
    call_command("django_vite_plugin", "--action", "config", stdout=stdout)

    config = json.loads(stdout.getvalue())
    assert config["DEV_MODE"] is False
    assert config["MANIFEST"] == str(tmp_path / "static" / ".vite" / "manifest.json")
    assert json.loads(stdout.getvalue()) == config
