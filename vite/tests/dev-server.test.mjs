// The plugin against a real vite dev server and a real build: the origin
// placeholder (audit #21, #22), the info page (#13) and the reloader (#19).
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { build, createServer } from 'vite'

import {
    callTransform,
    createProject,
    loadPluginNamed,
    loadPlugins,
    PLACEHOLDER,
    recordingLogger,
} from './helpers.mjs'

const ASSET = '/apps/blog/static/blog/img.png?import'

async function startServer(t, plugins, config = {}) {
    const server = await createServer({
        configFile: false,
        logLevel: 'silent',
        plugins,
        ...config,
    })
    t.after(() => server.close())
    return server
}

test('code without the placeholder is left alone', async (t) => {
    createProject(t)
    const plugin = await loadPluginNamed(
        { input: 'blog/main.js' },
        'origin-resolver',
    )

    assert.equal(await callTransform(plugin, 'const a = 1'), null)
})

test('a build resolves the placeholder to the build prefix', async (t) => {
    createProject(t)
    const plugin = await loadPluginNamed(
        { input: 'blog/main.js' },
        'origin-resolver',
    )

    const result = await callTransform(plugin, `url("${PLACEHOLDER}/img.png")`)

    assert.equal(result.code, 'url("/static/dist//img.png")')
    assert.equal(result.map, null)
})

test('the dev server rewrites asset URLs to its own origin', async (t) => {
    const project = createProject(t)
    const server = await startServer(t, await loadPlugins({ input: 'blog/main.js' }))
    await server.listen()

    const result = await server.transformRequest(ASSET)

    const devServerUrl = project.read('hot')
    assert.match(devServerUrl, /^http:\/\/.+:\d+$/)
    assert.ok(
        result.code.includes(`${devServerUrl}/apps/blog/static/blog/img.png`),
        `asset URL was ${result.code}`,
    )
    assert.ok(!result.code.includes(PLACEHOLDER))
})

test('CSS url() is rewritten to the dev server origin', async (t) => {
    // The rewrite is done by vite:css, which runs after every `pre`
    // transform — replacing the placeholder from `pre` missed it (audit #24).
    const project = createProject(t, {
        files: {
            'apps/blog/static/blog/style.css':
                '.a{background:url("./img.png")}\n',
        },
    })
    const server = await startServer(t, await loadPlugins({ input: 'blog/main.js' }))
    await server.listen()
    const base = `http://localhost:${server.config.server.port}`
    const devServerUrl = project.read('hot')

    // As a `<link>` tag loads it, and as a JS module import.
    for (const accept of ['text/css', '*/*']) {
        const res = await fetch(`${base}/apps/blog/static/blog/style.css`, {
            headers: { accept },
        })
        const css = await res.text()
        assert.ok(
            css.includes(`${devServerUrl}/apps/blog/static/blog/img.png`),
            `served CSS (${accept}) was ${css}`,
        )
        assert.ok(!css.includes(PLACEHOLDER))
    }
})

test('a transform that starts before the server is listening waits for it', async (t) => {
    createProject(t)
    const server = await startServer(t, await loadPlugins({ input: 'blog/main.js' }))

    const pending = server.transformRequest(ASSET)
    let settled = false
    pending.then(() => (settled = true))
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(settled, false, 'it cannot answer before the URL is known')

    await server.listen()
    const result = await pending

    assert.match(result.code, /http:\/\/.+:\d+\/apps\/blog\/static\/blog\/img\.png/)
})

test('middleware mode falls back to a relative URL and says so', async (t) => {
    createProject(t)
    const { lines, logger } = recordingLogger()
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
        { logLevel: 'info', customLogger: logger, server: { middlewareMode: true } },
    )

    const result = await server.transformRequest(ASSET)

    assert.match(result.code, /"\/apps\/blog\/static\/blog\/img\.png/)
    assert.ok(!result.code.includes(PLACEHOLDER))
    assert.ok(
        lines.some((line) => line.includes('could not determine the dev server URL')),
        `logged: ${lines.join(' | ')}`,
    )
})

test('the info page answers /index.html and nothing else', async (t) => {
    createProject(t)
    const server = await startServer(t, await loadPlugins({ input: 'blog/main.js' }))
    await server.listen()
    const base = `http://localhost:${server.config.server.port}`

    const info = await fetch(`${base}/index.html`)
    assert.equal(info.status, 404)
    assert.equal(info.headers.get('content-type'), 'text/html')
    assert.match(await info.text(), /Django Vite/)

    const asset = await fetch(`${base}/apps/blog/static/blog/main.js`)
    assert.equal(asset.status, 200)
    assert.match(await asset.text(), /style\.css/)
})

test('the hot file is written with the dev server URL', async (t) => {
    const project = createProject(t)
    const server = await startServer(t, await loadPlugins({ input: 'blog/main.js' }))
    await server.listen()

    const address = server.httpServer.address()
    const host =
        address.family === 'IPv6' ? `[${address.address}]` : address.address
    assert.equal(project.read('hot'), `http://${host}:${address.port}`)
})

test('a build emits the entry and leaves the placeholder nowhere', async (t) => {
    createProject(t)
    const plugins = await loadPlugins({ input: 'blog/main.js' })

    const result = await build({
        configFile: false,
        logLevel: 'silent',
        plugins,
        build: { write: false },
    })

    const output = result.output ?? result[0].output
    const js = output.find((file) => file.fileName.endsWith('.js'))
    assert.ok(js, 'no javascript was emitted')
    assert.ok(!js.code.includes(PLACEHOLDER))
    assert.ok(output.some((file) => file.fileName.endsWith('.css')))
})

test('the reloader watches the files Django named and reloads on a change', async (t) => {
    createProject(t)
    const reloader = await loadPluginNamed(
        { input: 'blog/main.js', delay: 0 },
        'reloader',
    )

    const watcher = new EventEmitter()
    watcher.add = (file) => (watcher.added ??= []).push(file)
    const sent = []
    const configureServer = reloader.configureServer.handler ?? reloader.configureServer
    configureServer.call(reloader, { ws: { send: (m) => sent.push(m) }, watcher })

    watcher.emit('change', '/some/app/views.py')
    watcher.emit('change', '/some/app/main.js')
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.deepEqual(sent, [{ type: 'full-reload', path: '*' }])
})

test('the reloader can be turned off', async (t) => {
    createProject(t)
    const reloader = await loadPluginNamed(
        { input: 'blog/main.js', reloader: false },
        'reloader',
    )
    assert.equal(reloader.configureServer, undefined)
})
