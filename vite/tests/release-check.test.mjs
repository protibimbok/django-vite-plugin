import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { build, createServer } from 'vite'

import {
    createProject,
    DIST,
    loadPlugins,
    PLACEHOLDER,
    recordingLogger,
} from './helpers.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const VITE_URL = pathToFileURL(
    createRequire(import.meta.url).resolve('vite'),
).href
const PLUGIN_URL = pathToFileURL(path.join(DIST, 'esm', 'index.js')).href

async function startServer(t, plugins, config = {}) {
    const server = await createServer({
        configFile: false,
        logLevel: 'silent',
        plugins,
        server: { port: 0 },
        ...config,
    })
    await server.listen()
    t.after(() => server.close())
    return server
}

async function buildWithLog(plugins, config = {}) {
    const { lines, logger } = recordingLogger()
    const result = await build({
        configFile: false,
        customLogger: logger,
        plugins,
        build: { write: false },
        ...config,
    })
    const output = result.output ?? result[0].output
    return { output, warnings: lines.join('\n') }
}

function manifestOf(output) {
    const asset = output.find((file) => file.fileName === '.vite/manifest.json')
    assert.ok(asset, 'no manifest was emitted')
    return JSON.parse(asset.source)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, what, timeout = 20000) {
    const until = Date.now() + timeout
    while (Date.now() < until) {
        if (check()) {
            return
        }
        await sleep(100)
    }
    assert.fail(`${what} did not happen within ${timeout}ms`)
}

test('#88: server.origin decides the hot file, over a wildcard host', async (t) => {
    const project = createProject(t)
    await startServer(t, await loadPlugins({ input: 'blog/main.js' }), {
        server: {
            port: 0,
            host: '0.0.0.0',
            origin: 'http://my_server_name:5173/',
        },
    })

    assert.equal(project.read('hot'), 'http://my_server_name:5173')
})

test('#89: a root of their own is refused and the build still succeeds', async (t) => {
    const project = createProject(t, { files: { 'frontend/.keep': '' } })
    const { output, warnings } = await buildWithLog(
        await loadPlugins({ input: 'blog/main.js' }),
        { root: path.join(project.root, 'frontend') },
    )

    assert.match(warnings, /'root' is '.*frontend' in your vite config/)
    assert.match(warnings, /STATIC_LOOKUP/)
    assert.ok(output.some((file) => file.fileName.endsWith('.js')))
    assert.deepEqual(
        Object.keys(manifestOf(output)).sort(),
        ['apps/blog/static/blog/img.png', 'apps/blog/static/blog/main.js'],
    )
})

test("#78: a rollupOptions.input of the user's own does not kill the build", async (t) => {
    createProject(t)
    const { output, warnings } = await buildWithLog(
        await loadPlugins({ input: 'blog/main.js' }),
        {
            build: {
                write: false,
                rollupOptions: {
                    input: { main: 'apps/blog/static/blog/main.js' },
                },
            },
        },
    )

    assert.match(warnings, /'build\.rollupOptions\.input' is set/)
    const js = output.filter((file) => file.fileName.endsWith('.js'))
    assert.equal(js.length, 1)
    assert.ok(!js[0].code.includes(PLACEHOLDER))
    assert.deepEqual(manifestOf(output)['apps/blog/static/blog/main.js'].name, 'main')
})

test('#80: SIGINT exits with 0 and takes the hot file with it', async (t) => {
    const project = createProject(t)
    const script = path.join(project.root, 'serve.mjs')
    fs.writeFileSync(
        script,
        [
            `const { createServer } = await import(${JSON.stringify(VITE_URL)})`,
            `const { djangoVitePlugin } = await import(${JSON.stringify(PLUGIN_URL)})`,
            'const plugins = await djangoVitePlugin({',
            "    input: 'blog/main.js', pyPath: 'python3',",
            '})',
            'const server = await createServer({',
            "    configFile: false, logLevel: 'silent', plugins,",
            '    server: { port: 0 },',
            '})',
            'await server.listen()',
            'await new Promise(() => {})',
        ].join('\n'),
    )
    const child = spawn(process.execPath, [script], {
        cwd: project.root,
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    child.stderr.on('data', (data) => (stderr += data))
    const exited = new Promise((resolve) =>
        child.on('exit', (code, signal) => resolve({ code, signal })),
    )
    t.after(() => child.kill('SIGKILL'))

    await waitFor(() => project.exists('hot'), 'the hot file')
    child.kill('SIGINT')
    const { code, signal } = await exited

    assert.equal(signal, null, `killed by ${signal}:\n${stderr}`)
    assert.equal(code, 0, `exit code ${code}:\n${stderr}`)
    assert.equal(project.exists('hot'), false, 'the hot file was left behind')
})

test('#40: a system-check warning on stderr does not fail the handshake', async (t) => {
    const stub = fs.readFileSync(path.join(HERE, 'fixtures', 'manage.py'), 'utf8')
    createProject(t, {
        files: {
            'manage.py': [
                'import sys',
                'sys.stderr.write("System check identified some issues:\\n\\n")',
                'sys.stderr.write("WARNINGS:\\n?: (home.W001) something is off\\n")',
                stub,
            ].join('\n'),
        },
    })

    const plugins = await loadPlugins({ input: 'blog/main.js' })

    assert.equal(plugins[0].name, 'django-vite-plugin')
    assert.ok(plugins[0].config, 'the plugin came back without its hooks')
})
