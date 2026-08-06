// Talking to Django: what the plugin does when that goes wrong (audit #12).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { createProject, loadPlugin } from './helpers.mjs'

test('a missing interpreter is named, with how to fix it', async (t) => {
    createProject(t)

    await assert.rejects(
        loadPlugin({ input: 'blog/main.js', pyPath: 'python-that-is-not-here' }),
        (error) => {
            assert.match(error.message, /could not run 'python-that-is-not-here'/)
            assert.match(error.message, /no such executable/)
            assert.match(error.message, /pyPath/)
            return true
        },
    )
})

test('an interpreter that cannot be executed reports the real cause', {
    skip: process.platform === 'win32',
}, async (t) => {
    const project = createProject(t)
    const notExecutable = path.join(project.root, 'python')
    fs.writeFileSync(notExecutable, '#!/bin/sh\nexit 0\n')
    fs.chmodSync(notExecutable, 0o644)

    await assert.rejects(
        loadPlugin({ input: 'blog/main.js', pyPath: notExecutable }),
        (error) => {
            assert.match(error.message, /could not run/)
            assert.match(error.message, /EACCES|permission denied/i)
            assert.doesNotMatch(error.message, /no such executable/)
            return true
        },
    )
})

test("Django's own error output is surfaced", async (t) => {
    createProject(t, {
        files: {
            'manage.py': [
                'import sys',
                'sys.stderr.write("ModuleNotFoundError: No module named \'django\'\\n")',
                'sys.exit(1)',
            ].join('\n'),
        },
    })

    await assert.rejects(loadPlugin({ input: 'blog/main.js' }), {
        message: /No module named 'django'/,
    })
})

test('output that is not JSON is reported as such', async (t) => {
    createProject(t, { files: { 'manage.py': 'print("not json")' } })

    await assert.rejects(loadPlugin({ input: 'blog/main.js' }), SyntaxError)
})

test('extra arguments reach the management command', async (t) => {
    const project = createProject(t, {
        files: {
            'manage.py': [
                'import json, sys',
                'sys.stderr.write(json.dumps(sys.argv[1:]))',
                'sys.exit(1)',
            ].join('\n'),
        },
    })

    await assert.rejects(
        loadPlugin({ input: 'blog/main.js', pyArgs: ['--settings=test'] }),
        (error) => {
            const argv = JSON.parse(error.message)
            assert.deepEqual(argv, [
                'django_vite_plugin',
                '--action',
                'config',
                '--settings=test',
            ])
            return true
        },
    )
    assert.ok(project.root)
})
