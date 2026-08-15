// Talking to Django: what the plugin does when that goes wrong (audit #12).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

import { createProject, DIST, loadPlugin } from './helpers.mjs'

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

test('output that is not JSON is reported with what produced it', async (t) => {
    createProject(t, { files: { 'manage.py': 'print("not json")' } })

    await assert.rejects(loadPlugin({ input: 'blog/main.js' }), (error) => {
        assert.match(error.message, /django-vite-plugin/)
        assert.match(error.message, /did not print JSON/)
        assert.match(error.message, /manage\.py django_vite_plugin --action config/)
        assert.match(error.message, /not json/, 'the output itself')
        assert.match(error.message, /print\(\)/, 'where stray output comes from')
        assert.ok(error.cause instanceof SyntaxError)
        return true
    })
})

test('a stray print in front of the JSON is reported, not swallowed', async (t) => {
    createProject(t, {
        files: {
            'manage.py': 'print("hi")\nprint(\'{"DEV_MODE": true}\')',
        },
    })

    await assert.rejects(loadPlugin({ input: 'blog/main.js' }), (error) => {
        assert.match(error.message, /did not print JSON/)
        assert.match(error.message, /hi/)
        return true
    })
})

test('a non-zero exit is not trusted even when the JSON parses', async (t) => {
    createProject(t, {
        files: {
            'manage.py': [
                'import sys',
                'print(\'{"DEV_MODE": true}\')',
                'sys.stderr.write("something went wrong\\n")',
                'sys.exit(3)',
            ].join('\n'),
        },
    })

    await assert.rejects(loadPlugin({ input: 'blog/main.js' }), (error) => {
        assert.match(error.message, /command failed/)
        assert.match(error.message, /exit code: 3/)
        assert.match(error.message, /something went wrong/)
        assert.equal(error.code, 3)
        return true
    })
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
            const argv = JSON.parse(error.stderr)
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

test('output larger than one pipe chunk arrives intact', async (t) => {
    // Decoding each chunk on its own splits a multi-byte character across the
    // boundary and leaves a replacement character where it was
    createProject(t, {
        files: {
            'manage.py': [
                'import json, sys',
                'sys.stdout.reconfigure(encoding="utf-8")',
                'sys.stdout.write(json.dumps({"pad": "\\U0001F600" * 80000},'
                    + ' ensure_ascii=False))',
            ].join('\n'),
        },
    })
    const { execPythonJSON } = await import(
        pathToFileURL(path.join(DIST, 'esm', 'helpers.js')).href
    )

    const result = await execPythonJSON(['--action', 'config'], {
        pyPath: 'python3',
    })

    assert.equal([...result.pad].length, 80000)
    assert.doesNotMatch(result.pad, /�/)
})
