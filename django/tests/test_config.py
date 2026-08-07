"""BASE_DIR handling and configuration merging (audit #6, #8)."""

from collections import OrderedDict
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured


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

    for_vite = p.module("management.commands.utils").format_config_for_output(config)
    assert for_vite["BUILD_DIR"] == str(static_root)


def test_the_build_url_prefix_gains_its_trailing_slash(plugin):
    p = plugin(STATIC_URL="/assets")
    assert p.config_helper.get_config()["BUILD_URL_PREFIX"] == "/assets/"


def test_an_unset_build_url_prefix_is_reported_as_misconfiguration(plugin):
    p = plugin(STATIC_URL=None)
    with pytest.raises(ImproperlyConfigured, match="STATIC_URL"):
        p.config_helper.get_config()


def test_an_explicit_prefix_stands_in_for_static_url(plugin):
    p = plugin(STATIC_URL=None, DJANGO_VITE_PLUGIN={"BUILD_URL_PREFIX": "/assets/"})
    assert p.config_helper.get_config()["BUILD_URL_PREFIX"] == "/assets/"
