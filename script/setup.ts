#!/usr/bin/env node --experimental-strip-types
/**
 * One-shot development setup, run from the repository root:
 *
 *     pnpm bootstrap              # JS workspace + Python package
 *     pnpm bootstrap --js-only    # pnpm install + build the Vite plugin
 *     pnpm bootstrap --py-only    # install the Django package (editable)
 *
 * The JS side is a pnpm workspace covering the plugin and every example, so
 * a single `pnpm install` prepares all of them. The Python side prefers uv
 * (`uv sync` against the workspace in pyproject.toml) and falls back to pip
 * (`pip install -e "./django[test]"`).
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SHELL = process.platform === 'win32'

const tty = process.stdout.isTTY
const color = (code: string, text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text)
const step = (msg: string) => console.log(`${color('94', '==>')} ${msg}`)
const ok = (msg: string) => console.log(`${color('92', '[OK]')} ${msg}`)
const fail = (msg: string): never => {
    console.error(`${color('91', '[ERROR]')} ${msg}`)
    process.exit(1)
}

function run(cmd: string, args: string[]): boolean {
    const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: SHELL })
    return result.status === 0
}

function commandWorks(cmd: string, args: string[]): boolean {
    return spawnSync(cmd, args, { stdio: 'ignore', shell: SHELL }).status === 0
}

/** uv if available, otherwise a python whose pip module works. */
function getPythonInstaller(): string | null {
    if (commandWorks('uv', ['--version'])) {
        return 'uv'
    }
    for (const python of ['python3', 'python']) {
        if (commandWorks(python, ['-m', 'pip', '--version'])) {
            return python
        }
    }
    return null
}

function setupJs(): void {
    if (!commandWorks('pnpm', ['--version'])) {
        fail('pnpm is required (the repo is a pnpm workspace). Install it with: npm install -g pnpm')
    }
    step('Installing JS workspace (plugin + examples)...')
    if (!run('pnpm', ['install'])) {
        fail('pnpm install failed')
    }
    step('Building the Vite plugin...')
    if (!run('pnpm', ['run', 'build'])) {
        fail('pnpm build failed')
    }
    ok('Vite plugin built, all examples ready')
}

function setupPython(installer: string): void {
    step(`Installing Django package with ${installer === 'uv' ? 'uv' : 'pip'}...`)
    const okInstall =
        installer === 'uv'
            ? run('uv', ['sync'])
            : run(installer, ['-m', 'pip', 'install', '-e', './django[test]'])
    if (!okInstall) {
        fail('Python install failed')
    }
    ok('Django package installed (editable)')
}

/** Example name -> manage.py path (it is not always at the example root). */
function discoverManagePys(): Map<string, string> {
    const found = new Map<string, string>()
    const examplesDir = path.join(ROOT, 'example')
    for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
            continue
        }
        const dir = path.join(examplesDir, entry.name)
        const candidates = [
            'manage.py',
            ...readdirSync(dir, { withFileTypes: true })
                .filter((sub) => sub.isDirectory() && sub.name !== 'node_modules')
                .map((sub) => path.join(sub.name, 'manage.py')),
        ]
        for (const candidate of candidates) {
            if (existsSync(path.join(dir, candidate))) {
                found.set(entry.name, path.join('example', entry.name, candidate))
                break
            }
        }
    }
    return found
}

function printRunInstructions(installer: string): void {
    const py = installer === 'uv' ? 'uv run' : 'python'
    const vite = installer === 'uv' ? 'uv run pnpm' : 'pnpm'

    console.log()
    console.log(color('1', 'To run an example (two terminals, from this directory):'))
    for (const [name, managePy] of discoverManagePys()) {
        console.log(`  ${name}:`)
        console.log(`    ${py} ${managePy} runserver`)
        console.log(`    ${vite} dev ${name}`)
    }
    console.log()
    console.log(color('1', 'Tests:'))
    console.log(installer === 'uv' ? '  uv run pytest' : '  pytest')
    console.log('  pnpm test')
    console.log()
}

const args = process.argv.slice(2)
const jsOnly = args.includes('--js-only')
const pyOnly = args.includes('--py-only')
const unknown = args.filter((a) => !['--js-only', '--py-only'].includes(a))
if (unknown.length) {
    fail(`Unknown option: ${unknown.join(' ')}. Usage: pnpm bootstrap [--js-only | --py-only]`)
}

console.log()
console.log(color('1', 'Django Vite Plugin - Setup'))
console.log('='.repeat(26))
console.log()

const installer = jsOnly ? null : getPythonInstaller()
if (!jsOnly && !installer) {
    fail('No Python installer found. Install uv or pip.')
}

if (!pyOnly) {
    setupJs()
}
if (!jsOnly && installer) {
    setupPython(installer)
}

ok('Done')
printRunInstructions(installer ?? 'python')
