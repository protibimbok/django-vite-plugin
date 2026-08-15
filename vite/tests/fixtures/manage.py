#!/usr/bin/env python3
"""A stub `manage.py` speaking the django-vite-plugin JSON protocol.

The Vite half of the plugin only ever talks to Django through this command, so
the tests can drive the real plugin without a Django install. It answers from
its own location, so the project layout around it is what the tests control.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[2:]  # drop the script name and 'django_vite_plugin'

if "--find-static" in argv:
    # Mirrors `find_asset`: an app-relative path resolves under the app's
    # static directory, anything else is passed through.
    found = []
    for asset in argv[argv.index("--find-static") + 1:]:
        app = asset.split("/")[0]
        candidate = os.path.join("apps", app, "static", asset)
        found.append(candidate if os.path.exists(os.path.join(ROOT, candidate)) else asset)
    print(json.dumps(found), end="")
    sys.exit(0)


hot_file = os.path.join(ROOT, "hot")
for arg in argv:
    if arg.startswith("--hot-file="):
        hot_file = os.path.join(ROOT, arg.split("=", 1)[1])

installed_apps = {}
apps_dir = os.path.join(ROOT, "apps")
if os.path.isdir(apps_dir):
    for name in sorted(os.listdir(apps_dir)):
        installed_apps[name] = os.path.join(apps_dir, name)

print(json.dumps({
    "DJANGO_VERSION": "6.0",
    "WS_CLIENT": "@vite/client",
    "DEV_MODE": True,
    "BASE_DIR": ROOT,
    "BUILD_DIR": os.path.join(ROOT, "static", "dist"),
    "MANIFEST": os.path.join(
        ROOT,
        os.environ.get("STUB_MANIFEST", "static/dist/.vite/manifest.json"),
    ),
    # Empty stands for the null a dev-mode project with no STATIC_URL reports
    "BUILD_URL_PREFIX": os.environ.get("STUB_BUILD_URL_PREFIX", "/static/dist/") or None,
    "JS_ATTRS": {"type": "module"},
    "CSS_ATTRS": {"rel": "stylesheet"},
    "STATIC_LOOKUP": os.environ.get("STUB_STATIC_LOOKUP", "1") == "1",
    "INSTALLED_APPS": installed_apps,
    "HOT_FILE": hot_file,
}))
