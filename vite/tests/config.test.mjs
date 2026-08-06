// What the plugin hands back from vite's `config` hook, and what it does with
// the app map Django sends (audit #19).
import assert from 'node:assert/strict'
import test from 'node:test'

import {
    callConfigHook,
    createProject,
    loadPlugin,
    loadPlugins,
    PLACEHOLDER,
    usePythonShim,
} from './helpers.mjs'

test('a string input is accepted as the entry', { skip: process.platform === 'win32' }, async (t) => {
    createProject(t)
    usePythonShim(t)

    const plugins = await loadPlugins('blog/main.js')

    assert.equal(plugins.length, 3)
    assert.deepEqual(callConfigHook(plugins[0]).build.rollupOptions.input, [
        'apps/blog/static/blog/main.js',
    ])
})

test('inputs are resolved through the static finder', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: ['blog/main.js', 'other.js'] })
    assert.deepEqual(callConfigHook(plugin).build.rollupOptions.input, [
        'apps/blog/static/blog/main.js',
        'other.js',
    ])
})

test('the build reads its output directory from Django', async (t) => {
    const project = createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const { build, base } = callConfigHook(plugin, {}, 'build')

    assert.equal(build.manifest, true)
    assert.equal(build.assetsInlineLimit, 0)
    assert.equal(build.outDir, `${project.root}/static/dist`)
    assert.equal(base, '/static/dist/')
})

test('the dev server serves from a relative base', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    assert.equal(callConfigHook(plugin, {}, 'serve').base, '')
})

test('user build options win over the defaults', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const { build } = callConfigHook(
        plugin,
        { build: { outDir: 'somewhere-else', manifest: false, assetsInlineLimit: 4096 } },
        'build',
    )

    assert.equal(build.outDir, 'somewhere-else')
    assert.equal(build.manifest, false)
    assert.equal(build.assetsInlineLimit, 4096)
})

test('an origin placeholder stands in for the unknown dev server URL', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    assert.equal(callConfigHook(plugin).server.origin, PLACEHOLDER)
})

test("a user's own server.origin is left alone", async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    const config = callConfigHook(plugin, {
        server: { origin: 'https://assets.example.com' },
    })
    assert.equal(config.server.origin, 'https://assets.example.com')
})

test('each app gets a static and a template alias', async (t) => {
    const project = createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const { alias } = callConfigHook(plugin).resolve

    assert.equal(alias['@s:blog'], `${project.root}/apps/blog/static/blog`)
    assert.equal(alias['@t:blog'], `${project.root}/apps/blog/templates/blog`)
    assert.equal(alias['@'], '')
})

test('aliases are appended when the user writes them as an array', async (t) => {
    const project = createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const { alias } = callConfigHook(plugin, {
        resolve: { alias: [{ find: '~', replacement: '/src' }] },
    }).resolve

    assert.ok(Array.isArray(alias))
    assert.deepEqual(alias[0], { find: '~', replacement: '/src' })
    assert.ok(
        alias.some(
            (entry) =>
                entry.find === '@s:blog' &&
                entry.replacement === `${project.root}/apps/blog/static/blog`,
        ),
    )
})

test("a user's alias of the same name wins", async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const { alias } = callConfigHook(plugin, {
        resolve: { alias: { '@s:blog': '/somewhere/else' } },
    }).resolve

    assert.equal(alias['@s:blog'], '/somewhere/else')
})

test('a project without an entry point is rejected', async (t) => {
    createProject(t)
    await assert.rejects(loadPlugin({}), /no input is provided/)
})
