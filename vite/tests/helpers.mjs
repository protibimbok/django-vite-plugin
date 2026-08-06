// Builds throwaway Django+Vite projects and drives the real plugin in them.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const DIST = path.join(HERE, '..', 'dist')
export const PLACEHOLDER =
    'http://__django_vite_plugin_placeholder__.protibimbok'

/**
 * A project with a stub `manage.py`, one Django app and whatever extra files
 * the test asks for. Removed, and the working directory restored, when the
 * test ends.
 *
 * @param {object} t node:test context
 * @param {object} options
 * @param {Record<string,string>} options.files extra files, project-relative
 * @param {string} options.cwd where to run vite from, project-relative
 */
export function createProject(t, { files = {}, cwd = '.' } = {}) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dvp-')))
    const app = path.join(root, 'apps', 'blog', 'static', 'blog')
    fs.mkdirSync(app, { recursive: true })
    fs.copyFileSync(
        path.join(HERE, 'fixtures', 'manage.py'),
        path.join(root, 'manage.py'),
    )
    fs.writeFileSync(
        path.join(app, 'main.js'),
        'import "./style.css"\nimport img from "./img.png"\nconsole.log(img)\n',
    )
    fs.writeFileSync(path.join(app, 'style.css'), '.a{color:red}\n')
    fs.writeFileSync(path.join(app, 'img.png'), 'not really a png\n')

    for (const [name, content] of Object.entries(files)) {
        const file = path.join(root, name)
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.writeFileSync(file, content)
    }

    const previousCwd = process.cwd()
    process.chdir(path.join(root, cwd))
    t.after(() => {
        process.chdir(previousCwd)
        fs.rmSync(root, { recursive: true, force: true })
    })

    return {
        root,
        entry: 'blog/main.js',
        read: (name) => fs.readFileSync(path.join(root, name), 'utf8'),
        exists: (name) => fs.existsSync(path.join(root, name)),
    }
}

/** The plugin pair, built from the shipped ESM bundle. */
export async function loadPlugins(config) {
    const { djangoVitePlugin } = await import(
        path.join(DIST, 'esm', 'index.js')
    )
    if (typeof config === 'string' || Array.isArray(config)) {
        // The shorthand forms carry no `pyPath`, so they need `python` on PATH.
        return djangoVitePlugin(config)
    }
    return djangoVitePlugin({ pyPath: 'python3', ...config })
}

/**
 * Puts a `python` on PATH for the length of the test. The plugin defaults to
 * `pyPath: 'python'`, which most distributions no longer ship (audit #12).
 */
export function usePythonShim(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dvp-bin-'))
    fs.writeFileSync(path.join(dir, 'python'), '#!/bin/sh\nexec python3 "$@"\n')
    fs.chmodSync(path.join(dir, 'python'), 0o755)

    const previous = process.env.PATH
    process.env.PATH = `${dir}${path.delimiter}${previous}`
    t.after(() => {
        process.env.PATH = previous
        fs.rmSync(dir, { recursive: true, force: true })
    })
}

/** Just the main plugin object. */
export async function loadPlugin(config) {
    return (await loadPlugins(config))[0]
}

/** One plugin of the set, picked by the suffix of its name. */
export async function loadPluginNamed(config, suffix) {
    const plugins = await loadPlugins(config)
    const plugin = plugins.find((p) => p.name.endsWith(suffix))
    if (!plugin) {
        throw new Error(`no plugin named *${suffix}`)
    }
    return plugin
}

/** Runs a plugin's `config` hook the way vite does. */
export function callConfigHook(plugin, userConfig = {}, command = 'serve') {
    const hook = plugin.config.handler ?? plugin.config
    return hook.call(plugin, userConfig, { command, mode: 'development' })
}

/** Runs a plugin's `transform` hook after telling it how vite was invoked. */
export async function callTransform(plugin, code, command = 'build') {
    const configResolved = plugin.configResolved.handler ?? plugin.configResolved
    configResolved.call(plugin, {
        command,
        logger: { warn() {}, info() {} },
    })
    const transform = plugin.transform.handler ?? plugin.transform
    return transform.call(plugin, code, 'some-module.js')
}

/** Collects what a vite logger is asked to print. */
export function recordingLogger() {
    const lines = []
    return {
        lines,
        logger: {
            info: (message) => lines.push(message),
            warn: (message) => lines.push(message),
            warnOnce: (message) => lines.push(message),
            error: (message) => lines.push(message),
            clearScreen() {},
            hasErrorLogged: () => false,
            hasWarned: false,
        },
    }
}
