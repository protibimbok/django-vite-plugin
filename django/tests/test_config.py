"""BASE_DIR handling and configuration merging (audit #6, #8)."""

import json
from collections import OrderedDict
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.template import Context


def test_base_dir_accepts_a_string(plugin, tmp_path):
    p = plugin(BASE_DIR=str(tmp_path))
    assert p.constants.BASE_DIR == Path(tmp_path)


def test_base_dir_accepts_a_path(plugin, tmp_path):
    p = plugin(BASE_DIR=tmp_path)
    assert p.constants.BASE_DIR == tmp_path


def test_missing_base_dir_is_reported_as_misconfiguration(plugin):
    p = plugin(BASE_DIR=None)
    with pytest.raises(ImproperlyConfigured, match="BASE_DIR"):
        p.constants._get_base_dir()


def test_config_does_not_alias_the_defaults(plugin):
    # A key the user did not mention is where the aliasing used to happen.
    p = plugin(DJANGO_VITE_PLUGIN={"STATIC_LOOKUP": False})
    config = p.config_helper.get_config()
    assert config["JS_ATTRS"] is not p.constants.DEFAULT_CONFIG["JS_ATTRS"]

    config["JS_ATTRS"]["type"] = "text/babel"
    assert p.config_helper.get_config()["JS_ATTRS"] == {"type": "module"}


def test_user_settings_are_not_mutated(plugin):
    user_config = {"JS_ATTRS": {"defer": True}}
    p = plugin(DJANGO_VITE_PLUGIN=user_config)

    merged = p.config_helper.get_config()
    merged["JS_ATTRS"]["defer"] = False

    assert user_config == {"JS_ATTRS": {"defer": True}}


def test_dict_subclasses_are_merged_not_discarded(plugin):
    p = plugin(DJANGO_VITE_PLUGIN=OrderedDict(STATIC_LOOKUP=False))
    assert p.config_helper.get_config()["STATIC_LOOKUP"] is False


def test_nested_values_merge_over_the_defaults(plugin):
    p = plugin(DJANGO_VITE_PLUGIN={"JS_ATTRS": {"defer": True}})
    assert p.config_helper.get_config()["JS_ATTRS"] == {
        "type": "module",
        "defer": True,
    }


def test_build_attrs_merge_over_the_ones_you_wrote(plugin):
    """Over JS_ATTRS, not over the default it was itself merged over."""
    p = plugin(
        DJANGO_VITE_PLUGIN={
            "DEV_MODE": False,
            "JS_ATTRS": {"type": "module", "crossorigin": True},
            "JS_ATTRS_BUILD": {"defer": True},
        }
    )
    assert p.config_helper.get_config()["JS_ATTRS"] == {
        "type": "module",
        "crossorigin": True,
        "defer": True,
    }


def test_build_attrs_are_left_alone_in_dev_mode(plugin):
    p = plugin(
        DJANGO_VITE_PLUGIN={
            "DEV_MODE": True,
            "JS_ATTRS": {"type": "module"},
            "JS_ATTRS_BUILD": {"defer": True},
        }
    )
    assert p.config_helper.get_config()["JS_ATTRS"] == {"type": "module"}


def test_build_attrs_reach_the_tag_that_renders_them(plugin, manifest):
    manifest({"js/app.js": {"file": "assets/app-1234.js"}})
    p = plugin(
        DJANGO_VITE_PLUGIN={
            "DEV_MODE": False,
            "STATIC_LOOKUP": False,
            "JS_ATTRS": {"type": "module"},
            "JS_ATTRS_BUILD": {"defer": True},
        }
    )
    html = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}").render(
        Context()
    )
    assert 'type="module"' in html
    assert "defer" in html


@pytest.mark.parametrize("dev_mode", [1, "yes"])
def test_a_truthy_dev_mode_is_reduced_to_a_bool(plugin, dev_mode):
    """Everything downstream asks `is False` of it somewhere."""
    p = plugin(DJANGO_VITE_PLUGIN={"DEV_MODE": dev_mode})
    assert p.config_helper.get_config()["DEV_MODE"] is True


def test_manifest_and_hot_file_are_derived_from_the_build_dir(plugin, tmp_path):
    p = plugin()
    config = p.config_helper.get_config()
    assert config["MANIFEST"] == tmp_path / "static" / ".vite" / "manifest.json"
    assert config["HOT_FILE"] == str(tmp_path / ".hotfile")


def test_manifest_and_hot_file_accept_strings(plugin, tmp_path):
    p = plugin(
        DJANGO_VITE_PLUGIN={
            "MANIFEST": str(tmp_path / "m.json"),
            "HOT_FILE": tmp_path / "hot",
        }
    )
    config = p.config_helper.get_config()
    assert config["MANIFEST"] == tmp_path / "m.json"
    assert config["HOT_FILE"] == str(tmp_path / "hot")


# Relative paths are anchored at BASE_DIR rather than the cwd, because neither
# manage.py nor the Vite process is guaranteed to run from the project root.


def test_a_relative_build_dir_is_anchored_at_base_dir(plugin, tmp_path):
    p = plugin(DJANGO_VITE_PLUGIN={"BUILD_DIR": "build"})
    config = p.config_helper.get_config()
    assert config["BUILD_DIR"] == tmp_path / "build"
    assert config["MANIFEST"] == tmp_path / "build" / ".vite" / "manifest.json"


def test_a_relative_manifest_is_anchored_at_base_dir(plugin, tmp_path):
    p = plugin(DJANGO_VITE_PLUGIN={"MANIFEST": "dist/manifest.json"})
    assert p.config_helper.get_config()["MANIFEST"] == tmp_path / "dist/manifest.json"


def test_a_relative_hot_file_is_anchored_at_base_dir(plugin, tmp_path):
    p = plugin(DJANGO_VITE_PLUGIN={"HOT_FILE": ".hotfile"})
    assert p.config_helper.get_config()["HOT_FILE"] == str(tmp_path / ".hotfile")


def test_an_absolute_build_dir_string_is_left_alone(plugin, tmp_path):
    # A string STATIC_ROOT used to reach Vite with its leading slash stripped,
    # sending the build somewhere Django would never look for the manifest.
    static_root = tmp_path / "elsewhere" / "static"
    p = plugin(STATIC_ROOT=str(static_root))

    config = p.config_helper.get_config()
    assert config["BUILD_DIR"] == static_root

    for_vite = p.module("management.commands._utils").format_config_for_output(config)
    assert for_vite["BUILD_DIR"] == str(static_root)


def test_the_build_url_prefix_gains_its_trailing_slash(plugin):
    p = plugin(STATIC_URL="/assets")
    assert p.config_helper.get_config()["BUILD_URL_PREFIX"] == "/assets/"


def test_a_relative_build_url_prefix_gains_its_leading_slash(plugin):
    """Django hands STATIC_URL over already absolute; a hand-written one is not."""
    p = plugin(STATIC_URL=None, DJANGO_VITE_PLUGIN={"BUILD_URL_PREFIX": "assets"})
    config = p.config_helper.get_config()
    assert config["BUILD_URL_PREFIX"] == "/assets/"

    # It is also Vite's `base`, which it will not take without the slash
    for_vite = p.module("management.commands._utils").format_config_for_output(config)
    assert for_vite["BUILD_URL_PREFIX"] == "/assets/"


def test_a_prefix_on_another_host_is_left_absolute(plugin):
    p = plugin(
        STATIC_URL=None,
        DJANGO_VITE_PLUGIN={"BUILD_URL_PREFIX": "https://cdn.example.com/assets"},
    )
    assert p.config_helper.get_config()["BUILD_URL_PREFIX"] == (
        "https://cdn.example.com/assets/"
    )


def test_a_protocol_relative_prefix_is_left_alone(plugin):
    p = plugin(
        STATIC_URL=None,
        DJANGO_VITE_PLUGIN={"BUILD_URL_PREFIX": "//cdn.example.com/assets/"},
    )
    assert p.config_helper.get_config()["BUILD_URL_PREFIX"] == (
        "//cdn.example.com/assets/"
    )


def test_an_unset_build_url_prefix_is_reported_as_misconfiguration(plugin):
    p = plugin(STATIC_URL=None)
    with pytest.raises(ImproperlyConfigured, match="STATIC_URL"):
        p.config_helper.get_config()


def test_dev_mode_does_not_need_a_build_url_prefix(plugin, hot_file):
    """Nothing serves a built asset in dev mode, so nothing needs the prefix."""
    hot_file("http://localhost:5173")
    p = plugin(STATIC_URL=None, DEBUG=True)
    assert p.config_helper.get_config()["BUILD_URL_PREFIX"] is None

    html = p.engine().from_string("{% load vite %}{% vite 'js/app.js' %}")
    assert html.render(Context()) == (
        '<script type="module" src="http://localhost:5173/js/app.js"></script>'
    )


@pytest.mark.parametrize("dev_mode", [True, 1, "yes"])
def test_no_prefix_is_needed_however_dev_mode_is_spelled_truthy(plugin, dev_mode):
    p = plugin(STATIC_URL=None, DJANGO_VITE_PLUGIN={"DEV_MODE": dev_mode})
    assert p.config_helper.get_config()["BUILD_URL_PREFIX"] is None


@pytest.mark.parametrize("dev_mode", [False, 0, ""])
def test_a_falsy_dev_mode_still_needs_one(plugin, dev_mode):
    """Anything that loads the manifest renders a URL under the prefix."""
    p = plugin(STATIC_URL=None, DJANGO_VITE_PLUGIN={"DEV_MODE": dev_mode})
    with pytest.raises(ImproperlyConfigured, match="STATIC_URL"):
        p.config_helper.get_config()


def test_dev_mode_still_normalises_a_prefix_it_was_given(plugin):
    p = plugin(
        STATIC_URL=None,
        DJANGO_VITE_PLUGIN={"DEV_MODE": True, "BUILD_URL_PREFIX": "assets"},
    )
    assert p.config_helper.get_config()["BUILD_URL_PREFIX"] == "/assets/"


def test_a_dev_mode_project_still_reaches_vite_and_the_urlconf(plugin):
    """Both read the prefix; neither may trip over the one dev mode leaves unset."""
    p = plugin(STATIC_URL=None, DEBUG=True)
    config = p.config_helper.get_config()

    for_vite = p.module("management.commands._utils").format_config_for_output(config)
    assert for_vite["BUILD_URL_PREFIX"] is None
    assert json.dumps(for_vite)

    assert p.urls.urlpatterns == []


def test_an_explicit_prefix_stands_in_for_static_url(plugin):
    p = plugin(STATIC_URL=None, DJANGO_VITE_PLUGIN={"BUILD_URL_PREFIX": "/assets/"})
    assert p.config_helper.get_config()["BUILD_URL_PREFIX"] == "/assets/"
