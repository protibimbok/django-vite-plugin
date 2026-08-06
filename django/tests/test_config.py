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
