# Changelog

This repository publishes two packages: the Vite plugin
[`django-vite-plugin`](https://www.npmjs.com/package/django-vite-plugin) on npm
(`vite/`) and the Django app
[`django_vite_plugin`](https://pypi.org/project/django-vite-plugin/) on PyPI
(`django/`).

Their version numbers ran separately until 4.1.0 — that is what the `-npm` and
`-py` git tags mark — and have been the same since. Releases below are headed
with the date they went out, and labelled with the package they belong to
wherever only one of them shipped.

Full notes for every tagged release are on the
[releases page](https://github.com/protibimbok/django-vite-plugin/releases).

## 5.0.0 — 2026-10-10

The version numbers of the two packages are the same from here on, and both
are released together.

### Vite plugin

- **Dev server address.** A wildcard bind (`0.0.0.0`, `::`) no longer writes
  the unspecified address into the hot file, and says what to set for other
  devices on the network — including the `server.cors.origin` default that
  otherwise blocks the assets. An IPv6 host from the config is bracketed, and
  an IPv6 loopback is handed out as `localhost`, which CSP will accept. A
  `server.origin` of your own now decides the hot file too, so the URLs Vite
  rewrites and the tags Django renders no longer disagree about where the dev
  server is; it wins over `server.hmr.host` and the bound address.
- **Hot file ownership.** Quitting Vite no longer deletes a hot file another
  server owns; the file is removed on a programmatic `server.close()` as well
  as on exit, and a process serving several projects clears all of them.
- **The build.** `emptyOutDir` no longer defaults to wiping the static
  directory Django and `collectstatic` share. The plugin warns when
  `build.outDir`/`build.manifest` put the manifest where Django does not read
  it, and when a `base` in `vite.config.js` disagrees with `BUILD_URL_PREFIX`
  or, in dev, with the root the hot file sends browsers to.
  Entries named as an object, and a `build.rollupOptions.input` of your own,
  no longer break the build; the warning about the latter goes through Vite's
  logger, on the build it applies to, rather than out of `console.warn` on
  every `vite dev`.
- **Where the project is built from.** `STATIC_LOOKUP` names every asset
  relative to `BASE_DIR`, so `BASE_DIR` is now the root Vite builds and serves
  from, and the entries are resolved against it. The directory holding
  `manage.py` no longer stands in for it — a `src/` layout, where the two are
  not the same place, could not be configured to work at all — and neither does
  the directory Vite happens to run from, which a relative entry used to be
  resolved against: a `vite.config.js` in a subdirectory served correctly in
  dev and then built nothing. A Vite `root` of your own is refused, and said
  so, rather than taken as given; `STATIC_LOOKUP: False` still hands it back.
- **Aliases and IDE config.** The aliases reach a config file at every root
  rather than only the first, follow Vite's own `root`, and leave an alias you
  defined in `resolve.alias` to your definition — including one written as a
  `RegExp`, and without copying the whole array back into the merge, which
  listed every alias of yours twice. An empty or malformed
  `tsconfig.json`/`jsconfig.json` is reported instead of crashing or being
  overwritten, `addAliases` no longer drops a stray `jsconfig.json` into a
  TypeScript project, and nested apps get their aliases.
- **Talking to Django.** A missing Python interpreter is named along with how
  to fix it, and output that is not JSON is reported with the command that
  produced it — a stray `print()` in `settings.py` used to surface as a
  context-free `SyntaxError`.
- **Asset URLs in dev.** The origin placeholder no longer survives into the
  `url()` references of stylesheets the dev server hands out, and the
  transform no longer empties the build sourcemap.
- **`root`.** An absolute `root` is taken as given rather than appended to the
  working directory, and is resolved against the working directory rather than
  the location of `vite.config.js`.
- **Reloader.** Python files created after startup trigger a reload.
- **Info page.** The page answering `/index.html` is served with a
  `Content-Type`, and no longer calls `next()` after the response has ended.
- **Packaging.** CommonJS support is back alongside ESM, the stale `engines`
  range is gone — the plugin loads Vite at runtime, so Vite's own declaration
  is the one that decides which Node it runs on, and a copy here could only
  fall out of step with it — and the package names its subdirectory in its
  repository metadata.

### Django app

- **Security.** HTML attribute values and asset URLs are escaped. Dynamic
  attributes on a `{% vite %}` tag no longer leak between requests — the
  parsed node is shared by every render, and resolved attributes were being
  stored on it.
- **Tag parsing.** A filter on a quoted asset path is parsed as a filter, a
  quoted argument is a path even when it contains `=`, and a malformed tag
  reports itself instead of raising `IndexError` or silently dropping
  arguments.
- **Attributes.** `JS_ATTRS_BUILD` applies however `DEV_MODE` is spelled
  falsy, and an explicit `None` no longer breaks every render. An attribute
  set to `False` or `None` is left out rather than rendered as the string
  `"false"`, which HTML reads as set — this is also how a `JS_ATTRS` or
  `CSS_ATTRS` default is dropped. A tag's attributes go to the assets it
  names, not to the stylesheets those assets import.
- **Dev server.** A Vite restart on a new port no longer leaves parsed
  templates pointing at the dead one — including a restart quick enough that
  a coarse filesystem clock stamps the new hot file with the time the old one
  had. The hot file is read rather than cached against a timestamp and a size:
  the next free port makes a URL of the same length, so neither half of that
  signature could see the change. It is read once per render, not once per
  asset the tag names. A hand-written hot file may end with a
  newline, and an IPv6 host from the config produces a valid URL.
- **Static lookup.** A file that appears after startup is picked up rather
  than staying missing until a restart — while `DEBUG` is on; with it off a
  miss is cached like a hit, since `{% vite 'react' %}` or a project-level
  `static/` path would otherwise walk the finders on every render — absolute
  and slash-prefixed paths no
  longer crash the finders — and a slash-prefixed one loses its leading
  separator with `STATIC_LOOKUP` off too, rather than missing the manifest and
  swallowing `BUILD_URL_PREFIX`. Assets outside `BASE_DIR` keep a usable path
  and load in dev through Vite's `/@fs/` route, and an in-project virtualenv no
  longer makes every installed package look like a project app.
- **Manifest.** Circular imports terminate instead of raising
  `RecursionError`, a stylesheet two entries share is linked once per tag,
  clearing the caches leaves the manifest able to refill itself, and a rebuild
  is picked up without restarting the server — as one whole build or the
  other, never the gap between them. That last check is a `stat`, so it is
  made only while `DEBUG` is on, which is the only time a build can change
  under a running process; with `DEBUG` off a render costs no syscalls and
  `clear_caches()` is the way to pick up a new build. A manifest that has been deleted or is
  half-written stops the pages that read it instead of quietly serving the
  filenames of the build before it. Missing manifests and missing entries say
  which file and which asset.
- **Configuration.** Every configured path is resolved against `BASE_DIR`,
  `get_config()` no longer returns dicts aliased to the defaults, a `BASE_DIR`
  that is a string or unset is reported at import rather than crashing, and a
  `BUILD_URL_PREFIX` written by hand gets the leading slash Django gives
  `STATIC_URL`.
- **Stylesheets.** Stylus and PostCSS assets load as stylesheets in dev
  instead of as scripts, and so does a stylesheet named with a query —
  `{% vite 'app.scss?used' %}` used to render a `<script>`.
- Files are read as UTF-8 regardless of the locale encoding.

### Both

- Test suites for both packages, and CI that runs them across Python 3.9–3.13,
  Django 4.2–latest, Node 22/24, and on Windows.

## 4.1.2 — 2025-10-13

- Fix [#87](https://github.com/protibimbok/django-vite-plugin/issues/87).
- Fix a potential issue of incorrect URL generation in assets.

## 4.1.1 — 2025-09-11

- Allow Vite 7 ([#86](https://github.com/protibimbok/django-vite-plugin/pull/86), by @PeterW-LWL).
- Handle OS exit signals ([#81](https://github.com/protibimbok/django-vite-plugin/pull/81), by @cmurtaugh).
- Fix trying to load `react` in production ([#84](https://github.com/protibimbok/django-vite-plugin/issues/84)).
- Use `Union` instead of `|`.

## 4.1.0 — 2025-03-30

- Fix: copy `info.html` while building.
- Fix: serving static assets in the dev server.
- Fix: the plugin's `input` was not merged with the Vite config's `input`.
- Get the Django version in the config command.
- Re-organised the codebase.

## 4.0.5 — 2025-03-20

- Added support for Vite 6 ([#76](https://github.com/protibimbok/django-vite-plugin/pull/76), by @BonaFideIT).
- Added support for React HMR.
- Fixed adding aliases when `tsconfig.app.json` is present.

## 4.0.4 (npm) — 2024-10-18

- Fix `__dirname` not defined ([#70](https://github.com/protibimbok/django-vite-plugin/pull/70)).

## 4.0.3 (npm) — 2024-09-27

- `__dirname` fix ([#69](https://github.com/protibimbok/django-vite-plugin/pull/69)).

## 4.0.2 (npm) — 2024-08-30

- Allow a separate ESM-compatible build ([#62](https://github.com/protibimbok/django-vite-plugin/pull/62), by @cpontvieux-systra).

## 3.0.4 (PyPI) — 2024-08-11

- When the manifest file does not exist, write a message to stderr and
  continue.

## 3.0.3 (PyPI) — 2024-07-29

- Replace apps loading ([#61](https://github.com/protibimbok/django-vite-plugin/pull/61), by @qloridant).

## 3.0.2 (PyPI) — 2024-07-15

- Fix: the build failed when run for the first time without dev mode
  ([#59](https://github.com/protibimbok/django-vite-plugin/pull/59)).

## 3.0.1 (PyPI) — 2024-07-06

- Fix recursive imports from the manifest ([#57](https://github.com/protibimbok/django-vite-plugin/pull/57), by @Supermanu).
- Fix: CSS files not loading properly because of caching ([#58](https://github.com/protibimbok/django-vite-plugin/pull/58)).

## 4.0.1 (npm) — 2024-05-30

- Use `tsconfig` for TypeScript autocompletions ([#54](https://github.com/protibimbok/django-vite-plugin/pull/54)).

## 4.0.0 (npm) / 3.0.0 (PyPI) — 2023-12-26

- Vite server detection ([#48](https://github.com/protibimbok/django-vite-plugin/pull/48)).
- Fix Vite 5 and Rollup TypeScript errors, npm only ([#49](https://github.com/protibimbok/django-vite-plugin/pull/49)).

## 3.0.0 (npm) / 2.0.0 (PyPI) — 2023-11-26

- Added support for Vite 5 ([#45](https://github.com/protibimbok/django-vite-plugin/pull/45)).

Upgrading from Vite 4 needs `MANIFEST` in the `DJANGO_VITE_PLUGIN` section of
`settings.py`:

```py
DJANGO_VITE_PLUGIN = {
    'MANIFEST': '<YOUR_BUILD_PATH>/manifest.json',
}
```

## 1.3.4 (PyPI) — 2023-11-19

- `BUILD_DIR` is converted to `str` for all `Path` kinds ([#42](https://github.com/protibimbok/django-vite-plugin/pull/42), by @encetamasb).

## 2.0.4 (npm) — 2023-10-25

- Fix [#40](https://github.com/protibimbok/django-vite-plugin/issues/40):
  Vite crashed if Django wrote any warnings to stderr.

## 2.0.3 (npm) — 2023-09-29

- Strictly follow the dev server configuration in `settings.py`.
- Set the dev server origin from Django's `settings.py`.

## 1.3.3 (PyPI) — 2023-09-29

- Fix: the value of `BUILD_DIR` is assumed to be `static` by default.

## 1.3.2 (PyPI) — 2023-09-29

- Use Django's default options.

## 2.0.2 (npm) — 2023-08-30

- Both named and default exports.
- Added the browser reload feature.

## 2.0.1, 2.0.0 (npm) — 2023-08-29, 2023-08-28

Published without release notes.

## 1.3.1 (npm) — 2023-08-27

- Fix [#31](https://github.com/protibimbok/django-vite-plugin/issues/31).
- Export both named and default.

## 1.3.1 (PyPI) / 1.3.0 (npm) — 2023-08-06

- Allow a `Path` as `BUILD_DIR` (PyPI).
- `string` and `string[]` can be passed as the argument to the plugin (npm).
- Possible bug fix: user-defined configurations were not passed, npm
  ([#28](https://github.com/protibimbok/django-vite-plugin/issues/28)).

## 1.3.0 (PyPI) — 2023-07-23

- Do not try to read `manifest.json` if it does not exist. This used to stop
  the server from starting without a `manifest.json`, and caused an error in
  the build process
  ([#18](https://github.com/protibimbok/django-vite-plugin/issues/18)).

## 1.2.0 (PyPI) — 2023-07-19

- Fixed the bug: the build failed if `DEV_MODE` was set to `False`.

## 1.2.0 (npm) — 2023-06-25

- Added support for passing additional arguments to `manage.py` commands.

## 1.1.3, 1.1.2 (npm) — 2023-04-27, 2023-04-22

Published without release notes.

## 1.1.1 — 2023-04-21

- Added autocompletion support via `jsconfig.json` for app aliases.
- Ignore the `django_vite_plugin` app in aliases and other places.

## 1.1.0 — 2023-04-16

- Introduced the `root` configuration option.
- Added support for keeping `vite.config.js` in a nested directory or outside
  the project.
- `STATIC_LOOKUP` now uses the built-in static finder.
- Fix: CSS attributes were missing in production mode.

## 1.0.0 — 2023-04-03

- Added support for dynamic assets and attributes.
- Added app aliases (`@s:app`, `@t:app`).
- Static lookup adds `static/<app_name>` instead of `static`.

## 0.0.1 — 2023-03-25

The first release.
