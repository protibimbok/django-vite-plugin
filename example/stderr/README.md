# `stderr` — Django noise on stderr must not break the plugin

A manual regression check. The Vite side of the plugin shells out to
`manage.py django_vite_plugin` and parses its **stdout** as JSON; an early
version broke whenever Django wrote anything to **stderr** (system-check
warnings, deprecation notices, ...).

This project therefore registers a system check (`home/checks.py`) that
emits a warning on **every** management command — including the ones the
plugin runs. If `pnpm dev stderr` starts and the page loads, the plugin
correctly ignored the noise. The warning text says it is intentional; do
not "fix" it.

The same behaviour is covered automatically by `vite/tests/python.test.mjs`
("Django's own error output is surfaced"); this example exists to reproduce
it against a real project.

Everything else is a stock minimal setup using the plugin's default
configuration (no `DJANGO_VITE_PLUGIN` block at all).

## Run it

From the repository root ([setup](../README.md#quick-setup) first):

```sh
uv run pnpm dev stderr
```

This starts Django and Vite together (via `concurrently`) — the warning
shows up in the `[django]` stream, while `[vite]` starts cleanly despite
it. Then open http://localhost:8000.
