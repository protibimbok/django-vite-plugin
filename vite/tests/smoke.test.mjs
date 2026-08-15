// The published artifact has to load. Both entry points of the `exports` map
// shipped broken once (audit #1) because nothing ever imported the build.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { DIST } from './helpers.mjs'

const require = createRequire(import.meta.url)
const pkg = require('../package.json')

test('the CommonJS build can be required', () => {
    const cjs = require(path.join(DIST, 'cjs', 'index.js'))
    assert.equal(typeof cjs.djangoVitePlugin, 'function')
    assert.equal(typeof cjs.default, 'function')
})

test('the ESM build can be imported', async () => {
    const esm = await import(path.join(DIST, 'esm', 'index.js'))
    assert.equal(typeof esm.djangoVitePlugin, 'function')
    assert.equal(typeof esm.default, 'function')
})

test('both builds resolve BASE_DIR to the package root', async () => {
    const cjs = require(path.join(DIST, 'cjs', 'helpers.js'))
    const esm = await import(path.join(DIST, 'esm', 'helpers.js'))
    const packageRoot = path.resolve(DIST, '..')

    assert.equal(path.resolve(cjs.BASE_DIR), packageRoot)
    assert.equal(path.resolve(esm.BASE_DIR), packageRoot)
    assert.equal(cjs.pluginVersion(), pkg.version)
    assert.equal(esm.pluginVersion(), pkg.version)
})

test('every file the package promises is in the build', () => {
    for (const file of [
        pkg.main,
        pkg.module,
        pkg.types,
        pkg.exports['.'].require,
        pkg.exports['.'].import,
        'dist/info.html',
    ]) {
        assert.ok(
            fs.existsSync(path.join(DIST, '..', file)),
            `${file} is missing from the build`,
        )
    }
})
