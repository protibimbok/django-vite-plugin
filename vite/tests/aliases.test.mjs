// Where the `@s:`/`@t:` aliases are written, and where they are not (audit #20).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { parse } from 'jsonc-parser'

import {
    callConfigHook,
    createProject,
    loadConfiguredPlugin,
} from './helpers.mjs'

const EMPTY_CONFIG = '{\n  "compilerOptions": {}\n}\n'

function paths(project, file) {
    return parse(project.read(file)).compilerOptions.paths
}

test('nothing is written when the project has no config file', async (t) => {
    const project = createProject(t)
    await loadConfiguredPlugin({ input: 'blog/main.js' })
    assert.equal(project.exists('jsconfig.json'), false)
})

test('addAliases: true creates a jsconfig.json when there is none', async (t) => {
    const project = createProject(t)
    await loadConfiguredPlugin({ input: 'blog/main.js', addAliases: true })

    assert.deepEqual(paths(project, 'jsconfig.json')['@s:blog/*'], [
        './apps/blog/static/blog/*',
    ])
})

test('addAliases: false writes nothing at all', async (t) => {
    const project = createProject(t, { files: { 'jsconfig.json': EMPTY_CONFIG } })
    await loadConfiguredPlugin({ input: 'blog/main.js', addAliases: false })

    assert.equal(project.read('jsconfig.json'), EMPTY_CONFIG)
})

test('an existing jsconfig.json is updated in place', async (t) => {
    const project = createProject(t, { files: { 'jsconfig.json': EMPTY_CONFIG } })
    await loadConfiguredPlugin({ input: 'blog/main.js' })

    const written = paths(project, 'jsconfig.json')
    assert.deepEqual(written['@s:blog/*'], ['./apps/blog/static/blog/*'])
    assert.deepEqual(written['@t:blog/*'], ['./apps/blog/templates/blog/*'])
    assert.deepEqual(written['@/*'], ['./*'])
})

test('a restart that changes nothing does not touch the config file', async (t) => {
    // It runs on every start, and editors and watchers go by the mtime
    const project = createProject(t, { files: { 'jsconfig.json': EMPTY_CONFIG } })
    const plugin = await loadConfiguredPlugin({ input: 'blog/main.js' })

    const cfgPath = path.join(project.root, 'jsconfig.json')
    const written = fs.readFileSync(cfgPath, 'utf8')
    fs.utimesSync(cfgPath, 0, 0)

    callConfigHook(plugin, {})

    assert.equal(fs.readFileSync(cfgPath, 'utf8'), written)
    assert.equal(fs.statSync(cfgPath).mtimeMs, 0, 'the file was written again')
})

test('a TypeScript project gets no stray jsconfig.json', async (t) => {
    const project = createProject(t, { files: { 'tsconfig.json': EMPTY_CONFIG } })
    await loadConfiguredPlugin({ input: 'blog/main.js', addAliases: true })

    assert.deepEqual(paths(project, 'tsconfig.json')['@s:blog/*'], [
        './apps/blog/static/blog/*',
    ])
    assert.equal(project.exists('jsconfig.json'), false)
})

test('tsconfig.app.json is preferred over tsconfig.json', async (t) => {
    const project = createProject(t, {
        files: {
            'tsconfig.json': EMPTY_CONFIG,
            'tsconfig.app.json': EMPTY_CONFIG,
        },
    })
    await loadConfiguredPlugin({ input: 'blog/main.js', addAliases: true })

    assert.ok(paths(project, 'tsconfig.app.json')['@s:blog/*'])
    assert.equal(project.read('tsconfig.json'), EMPTY_CONFIG)
    assert.equal(project.exists('jsconfig.json'), false)
})

test('the aliases of a project laid out under a subdirectory point back at it', async (t) => {
    const project = createProject(t, {
        files: { 'frontend/jsconfig.json': EMPTY_CONFIG },
        cwd: 'frontend',
    })
    await loadConfiguredPlugin({ input: 'blog/main.js', root: '..', addAliases: true })

    assert.deepEqual(paths(project, 'frontend/jsconfig.json')['@s:blog/*'], [
        './../apps/blog/static/blog/*',
    ])
    assert.equal(project.exists('jsconfig.json'), false)
})

test('@ points at the vite root, which is what @/x resolves against', async (t) => {
    const project = createProject(t, {
        files: { 'frontend/jsconfig.json': EMPTY_CONFIG },
        cwd: 'frontend',
    })
    await loadConfiguredPlugin({
        input: 'blog/main.js',
        root: '..',
        addAliases: true,
    })

    assert.deepEqual(paths(project, 'frontend/jsconfig.json')['@/*'], [
        './../*',
    ])
})

test("@ follows vite's own root when the user config sets one", async (t) => {
    const project = createProject(t, {
        files: { 'frontend/jsconfig.json': EMPTY_CONFIG },
        cwd: 'frontend',
    })
    await loadConfiguredPlugin(
        { input: 'blog/main.js', root: '..', addAliases: true },
        { root: '../apps' },
    )

    assert.deepEqual(paths(project, 'frontend/jsconfig.json')['@/*'], [
        './../apps/*',
    ])
})

test('an absolute root is taken as given, not appended to the cwd', async (t) => {
    const project = createProject(t, {
        files: { 'jsconfig.json': EMPTY_CONFIG, 'frontend/.keep': '' },
        cwd: 'frontend',
    })
    await loadConfiguredPlugin({
        input: 'blog/main.js',
        root: project.root,
        addAliases: true,
    })

    assert.deepEqual(paths(project, 'jsconfig.json')['@s:blog/*'], [
        './apps/blog/static/blog/*',
    ])
    assert.equal(project.exists('frontend/jsconfig.json'), false)
})

test('an absolute root does not misplace a created jsconfig.json', async (t) => {
    const project = createProject(t, {
        files: { 'frontend/.keep': '' },
        cwd: 'frontend',
    })
    await loadConfiguredPlugin({
        input: 'blog/main.js',
        root: project.root,
        addAliases: true,
    })

    assert.deepEqual(paths(project, 'jsconfig.json')['@s:blog/*'], [
        './apps/blog/static/blog/*',
    ])
})

test('a created jsconfig.json goes to the django root, not the vite one', async (t) => {
    // The lookup reads the vite root first, so it is the tempting place to
    // create one - but the aliases all name directories under the django root,
    // and an editor only reads the config above the file it is resolving
    const project = createProject(t, {
        files: { 'frontend/.keep': '' },
        cwd: 'frontend',
    })
    await loadConfiguredPlugin(
        { input: 'blog/main.js', root: '..', addAliases: true },
        { root: '.' },
    )

    assert.deepEqual(paths(project, 'jsconfig.json')['@s:blog/*'], [
        './apps/blog/static/blog/*',
    ])
    assert.equal(project.exists('frontend/jsconfig.json'), false)
})

test('a config file that does not parse is left alone, not crashed on', async (t) => {
    const broken = '{ "compilerOptions": {'
    const project = createProject(t, { files: { 'jsconfig.json': broken } })
    await loadConfiguredPlugin({ input: 'blog/main.js' })

    assert.equal(project.read('jsconfig.json'), broken)
})

test('an empty config file is left alone too', async (t) => {
    const project = createProject(t, { files: { 'tsconfig.json': '' } })
    await loadConfiguredPlugin({ input: 'blog/main.js' })

    assert.equal(project.read('tsconfig.json'), '')
})

test('a trailing comma does not count as broken', async (t) => {
    const project = createProject(t, {
        files: { 'jsconfig.json': '{\n  "compilerOptions": {},\n}\n' },
    })
    await loadConfiguredPlugin({ input: 'blog/main.js' })

    assert.ok(paths(project, 'jsconfig.json')['@s:blog/*'])
})

test('a config at the vite root and one at the django root both get them', async (t) => {
    // An editor reads whichever is nearest the file it is resolving, so writing
    // to only one of them silently left autocompletion dead (audit #4)
    const project = createProject(t, {
        files: {
            'jsconfig.json': EMPTY_CONFIG,
            'frontend/jsconfig.json': EMPTY_CONFIG,
        },
        cwd: 'frontend',
    })
    await loadConfiguredPlugin(
        { input: 'blog/main.js', root: '..' },
        { root: '.' },
    )

    // each names the same directories, spelled relative to itself
    const atVite = paths(project, 'frontend/jsconfig.json')
    assert.deepEqual(atVite['@s:blog/*'], ['./../apps/blog/static/blog/*'])
    assert.deepEqual(atVite['@/*'], ['./*'])

    const atDjango = paths(project, 'jsconfig.json')
    assert.deepEqual(atDjango['@s:blog/*'], ['./apps/blog/static/blog/*'])
    assert.deepEqual(atDjango['@/*'], ['./frontend/*'])
})

test('one directory playing two roles is still written once', async (t) => {
    const project = createProject(t, { files: { 'jsconfig.json': EMPTY_CONFIG } })
    await loadConfiguredPlugin({ input: 'blog/main.js', root: '.' })

    assert.deepEqual(paths(project, 'jsconfig.json')['@s:blog/*'], [
        './apps/blog/static/blog/*',
    ])
    assert.equal(project.exists('frontend/jsconfig.json'), false)
})

test('an alias the user redefines in vite.config is left alone', async (t) => {
    // `resolve.alias` gives the user's `@` precedence, so writing ours into the
    // config file would point the IDE where the bundler does not - and undo the
    // edit on every start (audit #3)
    const project = createProject(t, {
        files: {
            'jsconfig.json': [
                '{',
                '  "compilerOptions": {',
                '    "paths": {',
                '      "@/*": ["./src/*"]',
                '    }',
                '  }',
                '}',
                '',
            ].join('\n'),
        },
    })
    await loadConfiguredPlugin(
        { input: 'blog/main.js' },
        { resolve: { alias: { '@': '/src' } } },
    )

    const written = paths(project, 'jsconfig.json')
    assert.deepEqual(written['@/*'], ['./src/*'])
    assert.ok(written['@s:blog/*'], 'the aliases they did not touch still land')
})

test('an app alias they redefine is not dropped as a stale one either', async (t) => {
    const project = createProject(t, {
        files: {
            'jsconfig.json': [
                '{',
                '  "compilerOptions": {',
                '    "paths": {',
                '      "@s:blog/*": ["./elsewhere/*"]',
                '    }',
                '  }',
                '}',
                '',
            ].join('\n'),
        },
    })
    await loadConfiguredPlugin(
        { input: 'blog/main.js' },
        { resolve: { alias: [{ find: '@s:blog', replacement: '/elsewhere' }] } },
    )

    const written = paths(project, 'jsconfig.json')
    assert.deepEqual(written['@s:blog/*'], ['./elsewhere/*'])
    assert.deepEqual(written['@/*'], ['./*'], 'the others are still ours')
})

test('a RegExp alias cannot name a tsconfig path and is ignored', async (t) => {
    const project = createProject(t, { files: { 'jsconfig.json': EMPTY_CONFIG } })
    await loadConfiguredPlugin(
        { input: 'blog/main.js' },
        { resolve: { alias: [{ find: /^~(.*)$/, replacement: '/src$1' }] } },
    )

    assert.deepEqual(paths(project, 'jsconfig.json')['@/*'], ['./*'])
})

test("other people's paths and comments survive", async (t) => {
    const project = createProject(t, {
        files: {
            'jsconfig.json': [
                '{',
                '  // keep me',
                '  "compilerOptions": {',
                '    "paths": {',
                '      "~/*": ["./src/*"],',
                '      "@s:gone/*": ["./apps/gone/static/gone/*"]',
                '    }',
                '  }',
                '}',
                '',
            ].join('\n'),
        },
    })
    await loadConfiguredPlugin({ input: 'blog/main.js' })

    const written = paths(project, 'jsconfig.json')
    assert.deepEqual(written['~/*'], ['./src/*'])
    assert.ok(written['@s:blog/*'])
    assert.equal(written['@s:gone/*'], undefined, 'stale plugin aliases go')
    assert.ok(project.read('jsconfig.json').includes('// keep me'))
})
