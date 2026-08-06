#!/usr/bin/env node --experimental-strip-types
/**
 * Run an example project's package script from the repository root:
 *
 *     pnpm dev [name]
 *     pnpm e:build [name]
 *
 * Examples are discovered by scanning example/ for a package.json, either
 * directly in the example or in a subdirectory (the "frontend in its own
 * directory" layouts). With no name, the choices are listed and read from
 * stdin.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const EXAMPLES_DIR = path.join(ROOT, 'example')
const MODES = ['dev', 'build']

interface Example {
    name: string
    // The directory holding package.json - not always the example root
    dir: string
}

function discoverExamples(): Example[] {
    const examples: Example[] = []
    for (const entry of readdirSync(EXAMPLES_DIR, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) {
            continue
        }
        const dir = path.join(EXAMPLES_DIR, entry.name)
        if (existsSync(path.join(dir, 'package.json'))) {
            examples.push({ name: entry.name, dir })
            continue
        }
        for (const sub of readdirSync(dir, { withFileTypes: true })) {
            if (
                sub.isDirectory() &&
                !sub.name.startsWith('.') &&
                sub.name !== 'node_modules' &&
                existsSync(path.join(dir, sub.name, 'package.json'))
            ) {
                examples.push({ name: entry.name, dir: path.join(dir, sub.name) })
                break
            }
        }
    }
    return examples.sort((a, b) => a.name.localeCompare(b.name))
}

// "multi-app" and "Multi_App" both find multi_app
function normalize(name: string): string {
    return name.toLowerCase().replaceAll('-', '_')
}

async function chooseExample(examples: Example[]): Promise<Example> {
    console.log('Available examples:')
    examples.forEach((example, i) => {
        console.log(`  ${i + 1}. ${example.name}`)
    })

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await rl.question('Which example? ')).trim()
    rl.close()

    const byNumber = examples[Number(answer) - 1]
    const byName = examples.find((e) => normalize(e.name) === normalize(answer))
    const chosen = byName ?? byNumber
    if (!chosen) {
        console.error(`No example matching '${answer}'.`)
        process.exit(1)
    }
    return chosen
}

const [mode, name, ...extraArgs] = process.argv.slice(2)

if (!mode || !MODES.includes(mode)) {
    console.error('Usage: pnpm dev [name] | pnpm e:build [name]')
    process.exit(1)
}

const examples = discoverExamples()
let example: Example | undefined
if (name) {
    example = examples.find((e) => normalize(e.name) === normalize(name))
    if (!example) {
        console.error(
            `Unknown example '${name}'. Available: ${examples.map((e) => e.name).join(', ')}`,
        )
        process.exit(1)
    }
} else {
    example = await chooseExample(examples)
}

const result = spawnSync('pnpm', ['run', mode, ...extraArgs], {
    cwd: example.dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
