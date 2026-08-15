// What the plugin hands back from vite's `config` hook, and what it does with
// the app map Django sends (audit #19).
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { mergeConfig } from 'vite'

import {
    callConfigHook,
    createProject,
    loadPlugin,
    loadPlugins,
    PLACEHOLDER,
    recordingLogger,
    usePythonShim,
} from './helpers.mjs'

/** A path under the Django project, spelled the way vite spells one. */
function under(root, name) {
    return path.resolve(root, name).replace(/\\/g, '/')
}

test('a string input is accepted as the entry', { skip: process.platform === 'win32' }, async (t) => {
    const project = createProject(t)
    usePythonShim(t)

    const plugins = await loadPlugins('blog/main.js')

    assert.equal(plugins.length, 3)
    assert.deepEqual(callConfigHook(plugins[0]).build.rollupOptions.input, [
        under(project.root, 'apps/blog/static/blog/main.js'),
    ])
})

test('inputs are resolved through the static finder', async (t) => {
    const project = createProject(t)
    const plugin = await loadPlugin({ input: ['blog/main.js', 'other.js'] })
    assert.deepEqual(callConfigHook(plugin).build.rollupOptions.input, [
        under(project.root, 'apps/blog/static/blog/main.js'),
        under(project.root, 'other.js'),
    ])
})

test('object inputs keep their names and resolve their paths', async (t) => {
    const project = createProject(t)
    const plugin = await loadPlugin({
        input: { app: 'blog/main.js', vendor: 'other.js' },
    })
    assert.deepEqual(callConfigHook(plugin).build.rollupOptions.input, {
        app: under(project.root, 'apps/blog/static/blog/main.js'),
        vendor: under(project.root, 'other.js'),
    })
})

test('the entries are named against BASE_DIR, not the directory vite runs from', async (t) => {
    // rollup resolves a relative entry against the cwd, so a vite config in a
    // subdirectory built nothing at all, while dev - which resolves against
    // vite's root - went on working
    const project = createProject(t, {
        files: { 'frontend/.keep': '' },
        cwd: 'frontend',
    })
    const plugin = await loadPlugin({ input: 'blog/main.js', root: '..' })

    assert.deepEqual(callConfigHook(plugin).build.rollupOptions.input, [
        under(project.root, 'apps/blog/static/blog/main.js'),
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

test('the build directory django named is not emptied behind our back', async (t) => {
    // BUILD_DIR defaults to STATIC_ROOT or BASE_DIR/static, which is inside
    // vite's root, so vite would empty it - and it only warns when the
    // directory is outside (audit #25)
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    assert.equal(callConfigHook(plugin, {}, 'build').build.emptyOutDir, false)
})

test('emptying the build directory is still theirs to ask for', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const { build } = callConfigHook(
        plugin,
        { build: { emptyOutDir: true } },
        'build',
    )

    assert.equal(build.emptyOutDir, true)
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

test("entries named in vite.config.js keep the plugin's out of the merge", async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const { build } = callConfigHook(
        plugin,
        {
            build: {
                rollupOptions: { input: { main: 'apps/blog/static/blog/main.js' } },
            },
        },
        'build',
    )

    // Vite would merge ours into theirs rather than replace it, handing rollup
    // an array with an object in it (audit #1)
    assert.equal(build.rollupOptions, undefined)
})

const NAMED_ENTRIES = { build: { rollupOptions: { input: { a: 'x.js' } } } }

test('naming the entries yourself is called out, on the build it affects', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const onConsole = consoleWarnings(() =>
        callConfigHook(plugin, NAMED_ENTRIES, 'build'),
    )

    assert.equal(onConsole, '', 'vite has a logger, and log levels to go with it')
    assert.match(
        warningsFor(plugin, buildIn(process.cwd())),
        /rollupOptions\.input/,
    )
})

test('a dev server builds nothing, and says nothing about the entries', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const onConsole = consoleWarnings(() =>
        callConfigHook(plugin, NAMED_ENTRIES, 'serve'),
    )

    assert.equal(onConsole, '')
    assert.equal(
        warningsFor(plugin, { root: process.cwd(), command: 'serve' }),
        '',
    )
})

test('leaving the entries to the plugin says nothing either', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    callConfigHook(plugin, {}, 'build')
    assert.doesNotMatch(
        warningsFor(plugin, buildIn(process.cwd())),
        /rollupOptions\.input/,
    )
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

/**
 * The alias list vite actually resolves against: it merges the plugin's return
 * over the user's config, ours first, and takes the first entry that matches.
 */
function mergedAlias(returned, userConfig) {
    return mergeConfig(userConfig, returned).resolve.alias
}

test('aliases are added when the user writes them as an array', async (t) => {
    const project = createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    const userConfig = {
        resolve: { alias: [{ find: '~', replacement: '/src' }] },
    }

    const alias = mergedAlias(callConfigHook(plugin, userConfig), userConfig)

    assert.deepEqual(
        alias.map((entry) => entry.find),
        ['@', '@s:blog', '@t:blog', '~'],
        'theirs is carried in once, by vite, not twice by us',
    )
    assert.ok(
        alias.some(
            (entry) =>
                entry.find === '@s:blog' &&
                entry.replacement === `${project.root}/apps/blog/static/blog`,
        ),
    )
})

test('an alias of theirs is not shadowed by one of ours', async (t) => {
    // Vite merges ours ahead of theirs and the first match wins, so leaving
    // ours in would quietly take the name over
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    const userConfig = {
        resolve: { alias: [{ find: '@s:blog', replacement: '/somewhere' }] },
    }

    const alias = mergedAlias(callConfigHook(plugin, userConfig), userConfig)

    assert.deepEqual(
        alias.filter((entry) => entry.find === '@s:blog'),
        [{ find: '@s:blog', replacement: '/somewhere' }],
    )
})

test('a RegExp of theirs that covers one of ours takes it over too', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    const userConfig = {
        resolve: { alias: [{ find: /^@\/(.*)$/, replacement: '/src/$1' }] },
    }

    const alias = mergedAlias(callConfigHook(plugin, userConfig), userConfig)

    assert.deepEqual(
        alias.map((entry) => entry.find),
        ['@s:blog', '@t:blog', /^@\/(.*)$/],
    )
})

test('a RegExp of theirs that covers none of ours leaves them all', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    const userConfig = {
        resolve: { alias: [{ find: /^~(.*)$/, replacement: '/src$1' }] },
    }

    const alias = mergedAlias(callConfigHook(plugin, userConfig), userConfig)

    assert.deepEqual(
        alias.map((entry) => entry.find),
        ['@', '@s:blog', '@t:blog', /^~(.*)$/],
    )
})

test('a global RegExp is not left carrying state between aliases', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    const find = /^@[st]:blog\//g
    const userConfig = { resolve: { alias: [{ find, replacement: '/x' }] } }

    const alias = mergedAlias(callConfigHook(plugin, userConfig), userConfig)

    assert.deepEqual(
        alias.map((entry) => entry.find),
        ['@', find],
        'both of the aliases it covers are given up, not every other one',
    )
    assert.equal(find.lastIndex, 0)
})

test("a user's alias of the same name wins", async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    const { alias } = callConfigHook(plugin, {
        resolve: { alias: { '@s:blog': '/somewhere/else' } },
    }).resolve

    assert.equal(alias['@s:blog'], '/somewhere/else')
})

/** Whatever a call writes straight to the console, over vite's logger. */
function consoleWarnings(run) {
    const lines = []
    const original = console.warn
    console.warn = (...args) => lines.push(args.join(' '))
    try {
        run()
    } finally {
        console.warn = original
    }
    return lines.join('\n')
}

function warningsFor(plugin, resolved) {
    const { lines, logger } = recordingLogger()
    const hook = plugin.configResolved.handler ?? plugin.configResolved
    hook.call(plugin, { ...resolved, logger })
    return lines.join('\n')
}

/** What vite resolves for a build the plugin's own defaults went into. */
function buildIn(root, build = {}) {
    return {
        root,
        command: 'build',
        build: {
            outDir: path.join(root, 'static', 'dist'),
            manifest: true,
            ...build,
        },
    }
}

test('the root is BASE_DIR, wherever vite was started from', async (t) => {
    const project = createProject(t, {
        files: { 'frontend/.keep': '' },
        cwd: 'frontend',
    })
    const plugin = await loadPlugin({ input: 'blog/main.js', root: '..' })

    assert.equal(callConfigHook(plugin).root, project.root)
})

test('a root of their own is discarded, and not in silence', async (t) => {
    // Django names assets relative to BASE_DIR, so a root anywhere else is a
    // root the names cannot resolve against - it used to be taken as given
    const project = createProject(t, { files: { 'frontend/.keep': '' } })
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    const frontend = path.join(project.root, 'frontend')

    assert.equal(callConfigHook(plugin, { root: frontend }).root, project.root)

    const warnings = warningsFor(plugin, { root: project.root })
    assert.match(warnings, /STATIC_LOOKUP/)
    assert.match(warnings, /frontend/)
})

test('the roots agreeing is the normal case and says nothing', async (t) => {
    const project = createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { root: project.root })

    assert.equal(warningsFor(plugin, { root: project.root }), '')
})

test('turning the static lookup off hands the root back', async (t) => {
    const project = createProject(t, { files: { 'frontend/.keep': '' } })
    process.env.STUB_STATIC_LOOKUP = '0'
    t.after(() => delete process.env.STUB_STATIC_LOOKUP)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    const frontend = path.join(project.root, 'frontend')

    assert.equal(callConfigHook(plugin, { root: frontend }).root, frontend)
    assert.equal(warningsFor(plugin, { root: frontend }), '')
})

test('a base of their own is discarded, and not in silence', async (t) => {
    // Django renders BUILD_URL_PREFIX, so vite has to emit for the same prefix
    // - the override is right, but it used to happen without a word
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { base: '/my-cdn/' }, 'build')

    const warnings = warningsFor(plugin, buildIn(process.cwd()))

    assert.match(warnings, /BUILD_URL_PREFIX/)
    assert.match(warnings, /my-cdn/)
})

test('a build without a prefix to emit for is refused, not guessed', async (t) => {
    // Django leaves it null in dev mode; a build is where it becomes required
    createProject(t)
    process.env.STUB_BUILD_URL_PREFIX = ''
    t.after(() => delete process.env.STUB_BUILD_URL_PREFIX)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    assert.throws(
        () => callConfigHook(plugin, {}, 'build'),
        /BUILD_URL_PREFIX|STATIC_URL/,
    )
})

test('serving without one is what dev mode does', async (t) => {
    createProject(t)
    process.env.STUB_BUILD_URL_PREFIX = ''
    t.after(() => delete process.env.STUB_BUILD_URL_PREFIX)
    const plugin = await loadPlugin({ input: 'blog/main.js' })

    assert.equal(callConfigHook(plugin, {}, 'serve').base, '')
})

test('a base of their own is discarded in dev too, and not in silence', async (t) => {
    // Django builds dev URLs from the hot file, which carries no base, so
    // vite has to serve from the root - the build said so, dev just did it
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { base: '/app/' }, 'serve')

    const warnings = warningsFor(plugin, {
        root: process.cwd(),
        command: 'serve',
    })

    assert.match(warnings, /'base' is '\/app\/'/)
    assert.match(warnings, /hot file/)
})

test('the base dev already serves from is not worth mentioning', async (t) => {
    createProject(t)
    for (const base of ['/', undefined]) {
        const plugin = await loadPlugin({ input: 'blog/main.js' })
        callConfigHook(plugin, { base }, 'serve')

        assert.equal(
            warningsFor(plugin, { root: process.cwd(), command: 'serve' }),
            '',
            `base ${base}`,
        )
    }
})

test('a base that already agrees is not worth mentioning', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { base: '/static/dist/' }, 'build')

    assert.equal(warningsFor(plugin, buildIn(process.cwd())), '')
})

test('the manifest landing where Django reads it says nothing', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, {}, 'build')

    assert.equal(warningsFor(plugin, buildIn(process.cwd())), '')
})

test('a manifest renamed in vite.config.js is called out', async (t) => {
    // Django keeps reading BUILD_DIR/.vite/manifest.json and reports the
    // build as missing, which is the one thing that did just happen
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { build: { manifest: 'manifest.json' } }, 'build')

    const warnings = warningsFor(
        plugin,
        buildIn(process.cwd(), { manifest: 'manifest.json' }),
    )

    assert.match(warnings, /manifest\.json/)
    assert.match(warnings, /\.vite/)
    assert.match(warnings, /MANIFEST/)
})

test('an output directory of their own moves the manifest too', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { build: { outDir: 'somewhere-else' } }, 'build')

    const warnings = warningsFor(
        plugin,
        buildIn(process.cwd(), { outDir: 'somewhere-else' }),
    )

    assert.match(warnings, /somewhere-else/)
    assert.match(warnings, /BUILD_DIR/)
})

test("a relative output directory is read against vite's root", async (t) => {
    const project = createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { build: { outDir: 'static/dist' } }, 'build')

    const warnings = warningsFor(
        plugin,
        buildIn(project.root, { outDir: 'static/dist' }),
    )

    assert.equal(warnings, '')
})

test('MANIFEST is the way to follow the file vite writes', async (t) => {
    createProject(t)
    process.env.STUB_MANIFEST = 'static/dist/manifest.json'
    t.after(() => delete process.env.STUB_MANIFEST)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { build: { manifest: 'manifest.json' } }, 'build')

    const warnings = warningsFor(
        plugin,
        buildIn(process.cwd(), { manifest: 'manifest.json' }),
    )

    assert.equal(warnings, '')
})

test('turning the manifest off leaves Django nothing to resolve with', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { build: { manifest: false } }, 'build')

    const warnings = warningsFor(
        plugin,
        buildIn(process.cwd(), { manifest: false }),
    )

    assert.match(warnings, /writes no manifest/)
})

test('a dev server is not asked where the manifest went', async (t) => {
    createProject(t)
    const plugin = await loadPlugin({ input: 'blog/main.js' })
    callConfigHook(plugin, { build: { manifest: false } }, 'serve')

    const warnings = warningsFor(plugin, {
        root: process.cwd(),
        command: 'serve',
        build: { outDir: 'somewhere-else', manifest: false },
    })

    assert.equal(warnings, '')
})

test('a project without an entry point is rejected', async (t) => {
    createProject(t)
    await assert.rejects(loadPlugin({}), /no input is provided/)
})
