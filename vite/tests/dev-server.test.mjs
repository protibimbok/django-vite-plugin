// The plugin against a real vite dev server and a real build: the origin
// placeholder (audit #21, #22), the info page (#13) and the reloader (#19).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { build, createServer } from 'vite'

import {
    callTransform,
    createProject,
    DIST,
    loadPluginNamed,
    loadPlugins,
    PLACEHOLDER,
    recordingLogger,
} from './helpers.mjs'

// A subprocess runs from the throwaway project, where neither of these resolves
const VITE_URL = pathToFileURL(
    createRequire(import.meta.url).resolve('vite'),
).href
const PLUGIN_URL = pathToFileURL(path.join(DIST, 'esm', 'index.js')).href

const ASSET = '/apps/blog/static/blog/img.png?import'

function baseUrl(server) {
    const { address, family, port } = server.httpServer.address()
    const ipv6 = family === 'IPv6' || family === 6
    const host =
        address === '0.0.0.0'
            ? '127.0.0.1'
            : address === '::'
              ? '[::1]'
              : ipv6
                ? `[${address}]`
                : address
    return `http://${host}:${port}`
}

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
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
    )
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
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
    )
    await server.listen()
    const base = baseUrl(server)
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

test('a configured origin reaches both the assets and the hot file', async (t) => {
    // vite rewrites url() with `server.origin`; Django builds its <script src>
    // from the hot file. Only one of the two used to hear about it, and the
    // page ended up loading from two different origins (issue #90).
    const project = createProject(t, {
        files: {
            'apps/blog/static/blog/style.css':
                '.a{background:url("./img.png")}\n',
        },
    })
    const origin = 'http://my_server_name:5173'
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
        { server: { host: '0.0.0.0', origin } },
    )
    await server.listen()
    const base = baseUrl(server)

    assert.equal(project.read('hot'), origin)

    const css = await (
        await fetch(`${base}/apps/blog/static/blog/style.css`, {
            headers: { accept: 'text/css' },
        })
    ).text()
    assert.ok(
        css.includes(`${origin}/apps/blog/static/blog/img.png`),
        `served CSS was ${css}`,
    )
})

test('a base of their own does not move the assets out from under Django', async (t) => {
    // The plugin overrides `base` in serve mode and only warns about it. What
    // makes that the right call: the hot file carries no base, so Django asks
    // for the root path, and vite has to be the one serving it.
    const project = createProject(t)
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
        { base: '/app/' },
    )
    await server.listen()
    const devServerUrl = project.read('hot')

    assert.equal(server.config.base, '/')
    assert.match(devServerUrl, /^https?:\/\/[^/]+$/, 'no base to carry')
    // The URL Django renders, asked for the way Django renders it
    assert.equal(
        (await fetch(`${devServerUrl}/apps/blog/static/blog/main.js`)).status,
        200,
    )
})

test('a transform that starts before the server is listening waits for it', async (t) => {
    createProject(t)
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
    )

    const pending = server.transformRequest(ASSET)
    let settled = false
    pending.then(() => (settled = true))
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(settled, false, 'it cannot answer before the URL is known')

    await server.listen()
    const result = await pending

    assert.match(
        result.code,
        /http:\/\/.+:\d+\/apps\/blog\/static\/blog\/img\.png/,
    )
})

test('middleware mode falls back to a relative URL and says so', async (t) => {
    createProject(t)
    const { lines, logger } = recordingLogger()
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
        {
            logLevel: 'info',
            customLogger: logger,
            server: { middlewareMode: true },
        },
    )

    const result = await server.transformRequest(ASSET)

    assert.match(result.code, /"\/apps\/blog\/static\/blog\/img\.png/)
    assert.ok(!result.code.includes(PLACEHOLDER))
    assert.ok(
        lines.some((line) =>
            line.includes('could not determine the dev server URL'),
        ),
        `logged: ${lines.join(' | ')}`,
    )
})

test('the info page answers /index.html and nothing else', async (t) => {
    createProject(t)
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
    )
    await server.listen()
    const base = baseUrl(server)

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
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
    )
    await server.listen()

    // Which loopback vite lands on is the machine's to decide, so this pins
    // the part browsers depend on: a URL they can parse, on the bound port,
    // never the '[::1]' CSP rejects (issue #90). The mapping itself is
    // dev-server-url.test.mjs.
    const address = server.httpServer.address()
    const hot = project.read('hot')
    const parsed = new URL(hot)

    assert.equal(parsed.port, String(address.port))
    assert.ok(
        ['localhost', '127.0.0.1'].includes(parsed.hostname),
        `hot file points browsers at ${hot}`,
    )
})

test('a hot file Django put in a directory of its own still gets written', async (t) => {
    // HOT_FILE is Django's to name, and it may name somewhere nothing has
    // created yet - which used to throw out of the 'listening' handler
    const project = createProject(t)
    const server = await startServer(
        t,
        await loadPlugins({
            input: 'blog/main.js',
            pyArgs: ['--hot-file=run/vite.hot'],
        }),
    )

    await server.listen()

    const parsed = new URL(project.read('run/vite.hot'))
    assert.equal(Number(parsed.port), server.httpServer.address().port)
})

test('a hot file that cannot be written is reported, not thrown', async (t) => {
    const project = createProject(t, { files: { blocked: 'a file, not a dir' } })
    const { lines, logger } = recordingLogger()
    const server = await startServer(
        t,
        await loadPlugins({
            input: 'blog/main.js',
            pyArgs: ['--hot-file=blocked/vite.hot'],
        }),
        { customLogger: logger },
    )

    await server.listen()

    assert.equal(project.exists('blocked/vite.hot'), false)
    assert.match(lines.join('\n'), /could not write the hot file/)
    assert.match(lines.join('\n'), /HOT_FILE/)
})

test('closing the server takes the hot file with it', async (t) => {
    // Django reads the hot file to decide the dev server is up, so one left
    // behind by a programmatic close keeps it rendering dead script tags.
    const project = createProject(t)
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
    )
    await server.listen()
    assert.ok(project.exists('hot'))

    await server.close()

    assert.equal(project.exists('hot'), false)
})

test('a closing server does not take a replacement hot file with it', async (t) => {
    const project = createProject(t)
    const first = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
    )
    await first.listen()
    const second = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
    )
    await second.listen()

    const current = project.read('hot')
    await first.close()

    assert.equal(project.read('hot'), current)
})

// `process.on('exit')` cannot be exercised in-process without taking the test
// runner with it, so these drive a real node that starts a server and exits.
function runUntilExit(project, body) {
    const script = path.join(project.root, 'exit-case.mjs')
    fs.writeFileSync(
        script,
        [
            "import fs from 'node:fs'",
            `const { createServer } = await import(${JSON.stringify(VITE_URL)})`,
            `const { djangoVitePlugin } = await import(${JSON.stringify(PLUGIN_URL)})`,
            'const serve = async (pyArgs) => {',
            '    const plugins = await djangoVitePlugin({',
            "        input: 'blog/main.js', pyPath: 'python3', pyArgs,",
            '    })',
            '    const server = await createServer({',
            "        configFile: false, logLevel: 'silent', plugins,",
            '        server: { port: 0 },',
            '    })',
            '    await server.listen()',
            '    return server',
            '}',
            body,
            'process.exit(0)',
        ].join('\n'),
    )
    const done = spawnSync(process.execPath, [script], {
        cwd: project.root,
        encoding: 'utf8',
    })
    assert.equal(done.status, 0, `the case did not exit cleanly:\n${done.stderr}`)
}

test('exiting does not take a hot file the process no longer owns', async (t) => {
    // The `close` handler checks before deleting; the exit handler did not, so
    // quitting one vite deleted the hot file of another still serving the
    // project - Django then renders "dev server is not started" while it is up
    const project = createProject(t)
    runUntilExit(
        project,
        [
            'await serve([])',
            // a second vite takes the project over
            `fs.writeFileSync(${JSON.stringify(path.join('.', 'hot'))}, 'http://localhost:9999')`,
        ].join('\n'),
    )

    assert.equal(project.read('hot'), 'http://localhost:9999')
})

test('exiting clears the hot file of every project the process served', async (t) => {
    // The handler was bound once and closed over the first server's hot file,
    // so a second project's was left behind for Django to trust forever
    const project = createProject(t)
    runUntilExit(
        project,
        [
            "await serve(['--hot-file=hot'])",
            "await serve(['--hot-file=hot-two'])",
        ].join('\n'),
    )

    assert.equal(project.exists('hot'), false)
    assert.equal(project.exists('hot-two'), false, 'the second was left behind')
})

test('a wildcard bind hands out localhost, not the unspecified address', async (t) => {
    // `--host` / Docker setups bind '::' or '0.0.0.0'; browsers cannot load
    // from either, so the hot file must not name them (issues #83, #88).
    const project = createProject(t)
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
        { server: { host: true } },
    )
    await server.listen()

    const { port } = server.httpServer.address()
    assert.equal(project.read('hot'), `http://localhost:${port}`)
})

// `host: '0.0.0.0'` is the usual Docker recipe and `host: '::'` its IPv6 twin;
// taking either at its word writes an unreachable URL, or the outright invalid
// 'http://:::5173'.
for (const wildcard of ['0.0.0.0', '::']) {
    test(`the wildcard host string '${wildcard}' stays out of the hot file`, async (t) => {
        const project = createProject(t)
        const server = await startServer(
            t,
            await loadPlugins({ input: 'blog/main.js' }),
            { server: { host: wildcard } },
        )
        await server.listen()

        const { port } = server.httpServer.address()
        assert.equal(project.read('hot'), `http://localhost:${port}`)
    })
}

test('exposing vite to the network warns that the hot file says localhost', async (t) => {
    // Devices reaching Django over the LAN get asset URLs from the hot file;
    // 'localhost' sends them to themselves (issue #55).
    createProject(t)
    const { lines, logger } = recordingLogger()
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
        { logLevel: 'info', customLogger: logger, server: { host: true } },
    )
    await server.listen()

    assert.ok(
        lines.some((line) => line.includes("set 'server.hmr.host'")),
        `logged: ${lines.join(' | ')}`,
    )
})

test('an hmr host names the hot file host and silences the warning', async (t) => {
    const project = createProject(t)
    const { lines, logger } = recordingLogger()
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
        {
            logLevel: 'info',
            customLogger: logger,
            server: { host: true, hmr: { host: '192.168.1.10' } },
        },
    )
    await server.listen()

    const { port } = server.httpServer.address()
    assert.equal(project.read('hot'), `http://192.168.1.10:${port}`)
    assert.ok(!lines.some((line) => line.includes("set 'server.hmr.host'")))
})

test('an IPv6 hmr host reaches the hot file bracketed', async (t) => {
    // Bare, this wrote 'http://::1:PORT' — not a URL any browser can load
    // (audit #2).
    const project = createProject(t)
    const server = await startServer(
        t,
        await loadPlugins({ input: 'blog/main.js' }),
        { server: { hmr: { host: '::1' } } },
    )
    await server.listen()

    const { port } = server.httpServer.address()
    const hot = project.read('hot')
    assert.equal(hot, `http://[::1]:${port}`)
    assert.equal(new URL(hot).hostname, '[::1]')
})

test('an IPv6 host also brackets the origin written into assets', async (t) => {
    // The same URL replaces the origin placeholder in transformed code, so a
    // bare literal would break every asset reference too.
    createProject(t)
    const plugins = await loadPlugins({ input: 'blog/main.js' })
    const server = await startServer(t, plugins, {
        server: { hmr: { host: '2001:db8::1' } },
    })
    await server.listen()

    const { port } = server.httpServer.address()
    const plugin = plugins.find((p) => p.name.endsWith('origin-resolver'))
    const transform = plugin.transform.handler ?? plugin.transform
    const result = await transform.call(
        plugin,
        `url("${PLACEHOLDER}/img.png")`,
        'some-module.js',
    )

    assert.equal(result.code, `url("http://[2001:db8::1]:${port}/img.png")`)
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

test('a build leaves the rest of the static directory alone', async (t) => {
    // BUILD_DIR is Django's static directory, which holds hand-written assets
    // and whatever collectstatic put there; vite emptied all of it (audit #25)
    const project = createProject(t, {
        files: { 'static/dist/handwritten.css': 'body{color:red}\n' },
    })
    const plugins = await loadPlugins({ input: 'blog/main.js' })

    await build({ configFile: false, logLevel: 'silent', plugins })

    assert.equal(project.read('static/dist/handwritten.css'), 'body{color:red}\n')
})

test('a build survives entries named as an object in vite.config.js', async (t) => {
    // The shapes have to disagree: the plugin resolves `input` to an array, and
    // an object merged with an array becomes `[{...}, 'entry.js']`, which used
    // to kill the build with `id.endsWith is not a function` (audit #1)
    createProject(t)
    const plugins = await loadPlugins({ input: 'blog/main.js' })

    const result = await build({
        configFile: false,
        logLevel: 'silent',
        plugins,
        build: {
            write: false,
            rollupOptions: {
                input: { main: 'apps/blog/static/blog/main.js' },
            },
        },
    })

    const output = result.output ?? result[0].output
    const entry = output.find((file) => file.isEntry)
    assert.ok(entry, 'the entry the user named was not built')
    assert.equal(entry.name, 'main')
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
    const configureServer =
        reloader.configureServer.handler ?? reloader.configureServer
    configureServer.call(reloader, {
        ws: { send: (m) => sent.push(m) },
        watcher,
    })

    watcher.emit('change', '/some/app/views.py')
    watcher.emit('change', '/some/app/main.js')
    await new Promise((resolve) => setTimeout(resolve, 50))

    assert.deepEqual(sent, [{ type: 'full-reload', path: '*' }])
    assert.ok(
        watcher.added.some((entry) => entry.endsWith('apps/blog')),
        `the app directory is watched, not a startup file listing: ${watcher.added}`,
    )
})

test('a python file created after startup reloads too', async (t) => {
    createProject(t)
    const reloader = await loadPluginNamed(
        { input: 'blog/main.js', delay: 0 },
        'reloader',
    )

    const watcher = new EventEmitter()
    watcher.add = () => {}
    const sent = []
    const configureServer =
        reloader.configureServer.handler ?? reloader.configureServer
    configureServer.call(reloader, {
        ws: { send: (m) => sent.push(m) },
        watcher,
    })

    watcher.emit('add', '/some/app/brand_new_view.py')
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
