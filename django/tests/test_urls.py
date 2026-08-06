"""`django_vite_plugin.urls`: what it serves, and why it sometimes cannot (#7)."""

import warnings

import pytest


def load_urls(p):
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        return p.urls.urlpatterns


def test_dev_mode_serves_nothing_and_says_nothing(plugin):
    p = plugin(DEBUG=True)
    assert load_urls(p) == []


def test_a_local_prefix_is_routed(plugin, tmp_path):
    p = plugin(DEBUG=True, STATIC_URL="/static/", DJANGO_VITE_PLUGIN={"DEV_MODE": False})

    patterns = load_urls(p)

    assert len(patterns) == 1
    match = patterns[0].resolve("static/assets/app-1234.js")
    assert match is not None
    assert match.kwargs["path"].lstrip("/") == "assets/app-1234.js"
    assert match.kwargs["document_root"] == tmp_path / "static"


def test_the_path_of_a_cdn_prefix_is_still_routed(plugin):
    p = plugin(
        DEBUG=True,
        STATIC_URL="https://cdn.example.com/assets/v2/",
        DJANGO_VITE_PLUGIN={"DEV_MODE": False},
    )

    patterns = load_urls(p)

    assert patterns[0].resolve("assets/v2/app-1234.js") is not None


def test_debug_false_explains_why_nothing_is_served(plugin):
    p = plugin(DEBUG=False)
    with pytest.warns(UserWarning, match="DEBUG is"):
        assert p.urls.urlpatterns == []


def test_a_prefix_without_a_path_explains_itself(plugin):
    p = plugin(
        DEBUG=True,
        STATIC_URL="https://cdn.example.com",
        DJANGO_VITE_PLUGIN={"DEV_MODE": False},
    )
    with pytest.warns(UserWarning, match="has no path to route"):
        assert p.urls.urlpatterns == []


def test_a_bare_slash_prefix_warns_instead_of_raising(plugin):
    p = plugin(
        DEBUG=True,
        STATIC_URL="/",
        DJANGO_VITE_PLUGIN={"DEV_MODE": False},
    )
    with pytest.warns(UserWarning, match="has no path to route"):
        assert p.urls.urlpatterns == []
