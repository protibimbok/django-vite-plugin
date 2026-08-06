// Where the `@s:`/`@t:` aliases are written, and where they are not (audit #20).
import assert from 'node:assert/strict'
import test from 'node:test'

import { parse } from 'jsonc-parser'

import { createProject, loadPlugin } from './helpers.mjs'

const EMPTY_CONFIG = '{\n  "compilerOptions": {}\n}\n'

function paths(project, file) {
    return parse(project.read(file)).compilerOptions.paths
}

test('nothing is written when the project has no config file', async (t) => {
    const project = createProject(t)
    await loadPlugin({ input: 'blog/main.js' })
    assert.equal(project.exists('jsconfig.json'), false)
})

test('addAliases: true creates a jsconfig.json when there is none', async (t) => {
    const project = createProject(t)
    await loadPlugin({ input: 'blog/main.js', addAliases: true })

    assert.deepEqual(paths(project, 'jsconfig.json')['@s:blog/*'], [
        './apps/blog/static/blog/*',
    ])
})

test('addAliases: false writes nothing at all', async (t) => {
    const project = createProject(t, { files: { 'jsconfig.json': EMPTY_CONFIG } })
    await loadPlugin({ input: 'blog/main.js', addAliases: false })

    assert.equal(project.read('jsconfig.json'), EMPTY_CONFIG)
})

test('an existing jsconfig.json is updated in place', async (t) => {
    const project = createProject(t, { files: { 'jsconfig.json': EMPTY_CONFIG } })
    await loadPlugin({ input: 'blog/main.js' })

    const written = paths(project, 'jsconfig.json')
    assert.deepEqual(written['@s:blog/*'], ['./apps/blog/static/blog/*'])
    assert.deepEqual(written['@t:blog/*'], ['./apps/blog/templates/blog/*'])
    assert.deepEqual(written['@/*'], ['./*'])
})

test('a TypeScript project gets no stray jsconfig.json', async (t) => {
    const project = createProject(t, { files: { 'tsconfig.json': EMPTY_CONFIG } })
    await loadPlugin({ input: 'blog/main.js', addAliases: true })

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
    await loadPlugin({ input: 'blog/main.js', addAliases: true })

    assert.ok(paths(project, 'tsconfig.app.json')['@s:blog/*'])
    assert.equal(project.read('tsconfig.json'), EMPTY_CONFIG)
    assert.equal(project.exists('jsconfig.json'), false)
})

test('the aliases of a project laid out under a subdirectory point back at it', async (t) => {
    const project = createProject(t, {
        files: { 'frontend/jsconfig.json': EMPTY_CONFIG },
        cwd: 'frontend',
    })
    await loadPlugin({ input: 'blog/main.js', root: '..', addAliases: true })

    assert.deepEqual(paths(project, 'frontend/jsconfig.json')['@s:blog/*'], [
        './../apps/blog/static/blog/*',
    ])
    assert.equal(project.exists('jsconfig.json'), false)
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
    await loadPlugin({ input: 'blog/main.js' })

    const written = paths(project, 'jsconfig.json')
    assert.deepEqual(written['~/*'], ['./src/*'])
    assert.ok(written['@s:blog/*'])
    assert.equal(written['@s:gone/*'], undefined, 'stale plugin aliases go')
    assert.ok(project.read('jsconfig.json').includes('// keep me'))
})
