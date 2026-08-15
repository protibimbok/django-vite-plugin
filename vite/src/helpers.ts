import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import colors from 'picocolors'
import { Alias, AliasOptions, ResolvedConfig, normalizePath } from 'vite'
import { InputOption } from 'rollup'

import { parse, modify, applyEdits, ParseError } from 'jsonc-parser'

import type {
    AppConfig,
    DevServerUrl,
    InternalConfig,
    PluginConfig,
} from './config.js'
import { AddressInfo } from 'net'

import { BASE_DIR } from './basedir.js'

export { BASE_DIR }

export const ORIGIN_PLACEHOLDER =
    'http://__django_vite_plugin_placeholder__.protibimbok'

function pythonCommand(
    args: string[],
    config: PluginConfig,
): [string, string[]] {
    return [
        config.pyPath || 'python',
        [
            path.join(config.root || '', 'manage.py'),
            'django_vite_plugin',
            ...(args || []),
            ...(config.pyArgs || []),
        ],
    ]
}

export function execPythonNoErr(
    args: string[],
    config: PluginConfig,
): Promise<[string, string, number | null]> {
    return new Promise((resolve) => {
        const [pyPath, pyArgs] = pythonCommand(args, config)
        const py = spawn(pyPath, pyArgs)

        py.stdout.setEncoding('utf8')
        py.stderr.setEncoding('utf8')

        let err = '',
            res = ''
        py.stderr.on('data', (data) => {
            err += data
        })
        py.stdout.on('data', (data) => {
            res += data
        })

        py.on('error', (error: NodeJS.ErrnoException) => {
            err +=
                error.code === 'ENOENT'
                    ? `django-vite-plugin: could not run '${pyPath}'; no such executable.\n` +
                      "Set 'pyPath' to the Python of this project, e.g. " +
                      "djangoVitePlugin({ input: [...], pyPath: 'python3' })\n"
                    : `django-vite-plugin: could not run '${pyPath}': ${error.message}\n`
            resolve([res, err, null])
        })
        py.on('close', (code) => {
            resolve([res, err, code])
        })
    })
}

const MAX_REPORTED_OUTPUT = 500

function pythonError(
    args: string[],
    config: PluginConfig,
    stdout: string,
    stderr: string,
    code: number | null,
    cause?: unknown,
): Error {
    const [pyPath, pyArgs] = pythonCommand(args, config)
    const unparseable = Boolean(cause) && Boolean(stdout.trim())
    const lines = [
        unparseable
            ? 'django-vite-plugin: the django_vite_plugin command did not print JSON'
            : 'django-vite-plugin: the django_vite_plugin command failed',
        `  ran: ${[pyPath, ...pyArgs].join(' ')}`,
    ]
    if (code) {
        lines.push(`  exit code: ${code}`)
    }
    if (stderr.trim()) {
        lines.push(`  stderr: ${block(stderr)}`)
    }
    if (stdout.trim()) {
        lines.push(`  stdout: ${block(stdout)}`)
    }
    if (unparseable) {
        lines.push(
            "  A print() anywhere Django imports - settings.py, an app's " +
                'ready() - lands in this output. Write to sys.stderr instead.',
        )
    }
    return Object.assign(new Error(lines.join('\n'), { cause }), {
        stdout,
        stderr,
        code,
    })
}

function block(text: string): string {
    text = text.trim()
    if (text.length > MAX_REPORTED_OUTPUT) {
        text = `${text.slice(0, MAX_REPORTED_OUTPUT)}... (${text.length} characters in total)`
    }
    return text.split('\n').join('\n    ')
}

export async function execPythonJSON<T>(
    args: string[],
    config: PluginConfig,
): Promise<T> {
    const [res, err, code] = await execPythonNoErr(args, config)
    try {
        const parsed = JSON.parse(res)
        if (code !== 0) {
            throw pythonError(args, config, res, err, code)
        }
        return parsed
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw pythonError(args, config, res, err, code, error)
        }
        throw error
    }
}

export function pluginVersion(): string {
    try {
        const packageJson = path.join(BASE_DIR, '/package.json')
        return JSON.parse(fs.readFileSync(packageJson).toString())?.version
    } catch {
        return ''
    }
}

/**
 * Adds 'static' in file paths if already not exists
 */

export async function addStaticToInputs(
    input: InputOption,
    config: PluginConfig,
): Promise<string[] | Record<string, string>> {
    let inputs: string[]
    let isObj = false
    if (typeof input === 'string') {
        inputs = [input]
    } else if (!Array.isArray(input)) {
        inputs = Object.values(input)
        isObj = true
    } else {
        inputs = input
    }

    const res = await execPythonJSON<string[]>(
        ['--find-static', ...inputs.map((f) => normalizePath(f))],
        config,
    )

    if (isObj) {
        const resObj: Record<string, string> = {}
        let i = 0
        for (const key in input as Record<string, string>) {
            resObj[key] = res[i]
            i++
        }
        return resObj
    } else {
        return res
    }
}

const getJsOrTsConfigPaths = (
    config: InternalConfig,
    viteRoot: string,
): { root: string; cfgPath: string }[] => {
    const cwd = process.cwd()
    const djangoRoot = config.root ? path.resolve(cwd, config.root) : undefined

    const configFiles = ['tsconfig.app.json', 'tsconfig.json', 'jsconfig.json']

    const found: { root: string; cfgPath: string }[] = []
    const seen = new Set<string>()

    for (const root of [viteRoot, cwd, djangoRoot]) {
        if (!root || seen.has(root)) {
            continue
        }
        seen.add(root)
        for (const fileName of configFiles) {
            const cfgPath = path.join(root, fileName)
            if (fs.existsSync(cfgPath)) {
                found.push({ root, cfgPath })
                break
            }
        }
    }

    return found
}

function findMatches(find: Alias['find'], name: string): boolean {
    if (typeof find === 'string') {
        return find === name
    }
    const stateless = new RegExp(find.source, find.flags.replace(/[gy]/g, ''))
    return stateless.test(name) || stateless.test(`${name}/`)
}

export function aliasesTheUserDidNotClaim(
    aliases: Record<string, string>,
    userAliases?: AliasOptions,
): Record<string, string> {
    if (!userAliases) {
        return aliases
    }
    const claims = Array.isArray(userAliases)
        ? (name: string) =>
              userAliases.some((entry: Alias) => findMatches(entry.find, name))
        : (name: string) => Object.hasOwn(userAliases, name)

    return Object.fromEntries(
        Object.entries(aliases).filter(([name]) => !claims(name)),
    )
}

function userAliasNames(alias?: AliasOptions): Set<string> {
    if (!alias) {
        return new Set()
    }
    if (Array.isArray(alias)) {
        return new Set(
            alias
                .map((entry: Alias) => entry.find)
                .filter((find): find is string => typeof find === 'string'),
        )
    }
    return new Set(Object.keys(alias))
}

export function writeAliases(
    config: InternalConfig,
    aliases: Record<string, string>,
    viteRoot: string,
    createIfMissing = false,
    userAliases?: AliasOptions,
) {
    let targets = getJsOrTsConfigPaths(config, viteRoot)
    if (targets.length === 0) {
        if (!createIfMissing) {
            return
        }
        targets = [createJsConfig(config)]
    }

    for (const { root, cfgPath } of targets) {
        writeAliasesTo(cfgPath, root, aliases, viteRoot, userAliases)
    }
}

function writeAliasesTo(
    cfgPath: string,
    root: string,
    aliases: Record<string, string>,
    viteRoot: string,
    userAliases?: AliasOptions,
) {
    const fileContent = fs.readFileSync(cfgPath, 'utf8')

    const errors: ParseError[] = []
    const jsonNode = parse(fileContent, errors, {
        disallowComments: false,
        allowTrailingComma: true,
    })
    if (
        errors.length > 0 ||
        typeof jsonNode !== 'object' ||
        jsonNode === null ||
        Array.isArray(jsonNode)
    ) {
        console.warn(
            `django-vite-plugin: ${cfgPath} is not valid JSON, ` +
                'so the app aliases were not written into it',
        )
        return
    }
    const old = jsonNode.compilerOptions?.paths || {}
    const userDefined = userAliasNames(userAliases)

    const isOurs = (alias: string): boolean => {
        const name = alias.endsWith('/*') ? alias.slice(0, -2) : alias
        if (userDefined.has(name)) {
            return false
        }
        return (
            name.startsWith('@s:') ||
            name.startsWith('@t:') ||
            Object.hasOwn(aliases, name)
        )
    }

    const updatedPaths: Record<string, string[]> = {}

    for (const alias in old) {
        if (!isOurs(alias)) {
            updatedPaths[alias] = old[alias]
        }
    }

    for (let alias in aliases) {
        if (userDefined.has(alias)) {
            continue
        }
        let val = normalizePath(path.relative(root, aliases[alias] || viteRoot))
        if (val !== '.') {
            val = './' + val
        }
        val += '/*'
        alias += '/*'
        updatedPaths[alias] = [val]
    }

    const edits = modify(
        fileContent,
        ['compilerOptions', 'paths'],
        updatedPaths,
        {
            formattingOptions: {
                tabSize: 2,
                insertSpaces: true,
                keepLines: true,
            },
        },
    )

    const newContent = applyEdits(fileContent, edits)
    if (newContent === fileContent) {
        return
    }

    fs.writeFileSync(cfgPath, newContent, 'utf-8')
}

function createJsConfig(config: InternalConfig): {
    root: string
    cfgPath: string
} {
    const root = path.resolve(process.cwd(), config.root || '')
    const cfgPath = path.join(root, 'jsconfig.json')

    fs.writeFileSync(
        cfgPath,
        JSON.stringify({ exclude: ['node_modules'] }, null, 2),
    )

    return { root, cfgPath }
}

export function getAppAliases(appConfig: AppConfig): Record<string, string> {
    const aliases: Record<string, string> = {
        '@': '',
    }
    const apps = appConfig.INSTALLED_APPS

    for (const app in apps) {
        const trail = appConfig.STATIC_LOOKUP ? '/' + app : ''
        aliases[`@s:${app}`] = normalizePath(`${apps[app]}/static${trail}`)
        aliases[`@t:${app}`] = normalizePath(`${apps[app]}/templates${trail}`)
    }
    return aliases
}

function configuredOrigin(config: ResolvedConfig): DevServerUrl | null {
    const origin = config.server.origin
    if (!origin || origin === ORIGIN_PLACEHOLDER) {
        return null
    }

    const trimmed = origin.replace(/\/+$/, '')
    let protocol: string
    try {
        protocol = new URL(trimmed).protocol
    } catch {
        protocol = ''
    }

    if (protocol !== 'http:' && protocol !== 'https:') {
        config.logger.warn(
            colors.yellow(
                `django-vite-plugin: 'server.origin' is '${origin}', which is ` +
                    'not an http or https URL. Django reads the hot file to ' +
                    'find this server and cannot use anything else, so it is ' +
                    'being written with the address vite bound instead.',
            ),
        )
        return null
    }

    return trimmed as DevServerUrl
}

export function resolveDevServerUrl(
    address: AddressInfo,
    config: ResolvedConfig,
): DevServerUrl {
    const configured = configuredOrigin(config)
    if (configured) {
        return configured
    }

    const configHmrProtocol =
        typeof config.server.hmr === 'object'
            ? config.server.hmr.protocol
            : null
    const clientProtocol = configHmrProtocol
        ? configHmrProtocol === 'wss'
            ? 'https'
            : 'http'
        : null
    const serverProtocol = config.server.https ? 'https' : 'http'
    const protocol = clientProtocol ?? serverProtocol

    const configHmrHost =
        typeof config.server.hmr === 'object' ? config.server.hmr.host : null
    const configHost =
        typeof config.server.host === 'string' ? config.server.host : null

    const serverAddress =
        isWildcard(address.address) || isIpv6Loopback(address.address)
            ? 'localhost'
            : isIpv6(address)
              ? `[${address.address}]`
              : address.address

    const usableConfigHost =
        [configHmrHost, configHost].find(
            (h): h is string =>
                typeof h === 'string' && h !== '' && !isWildcard(h),
        ) ?? null

    const host = usableConfigHost
        ? bracketIpv6(usableConfigHost)
        : serverAddress

    if (!usableConfigHost && isWildcard(address.address)) {
        config.logger.warn(
            colors.yellow(
                'django-vite-plugin: vite is exposed to the network ' +
                    `(it is bound to '${address.address}'), but the hot file points ` +
                    `browsers at '${host}', which only works on this machine. For ` +
                    "other devices, set 'server.hmr.host' to the address they reach " +
                    'this machine at. Reaching vite is not enough on its own: set ' +
                    "'server.cors.origin' to the origin Django serves from, since " +
                    'vite answers cross-origin requests from nothing but localhost ' +
                    "by default, and 'server.allowedHosts' too if that address is a " +
                    'name rather than an IP.',
            ),
        )
    }

    const configHmrClientPort =
        typeof config.server.hmr === 'object'
            ? config.server.hmr.clientPort
            : null
    const port = configHmrClientPort ?? address.port

    return `${protocol}://${host}:${port}`
}

function bracketIpv6(host: string): string {
    if (!host.includes(':') || host.startsWith('[')) {
        return host
    }
    return `[${host}]`
}

function isWildcard(host: string): boolean {
    return host === '::' || host === '[::]' || host === '0.0.0.0'
}

function isIpv6Loopback(host: string): boolean {
    return (
        host === '::1' ||
        host === '[::1]' ||
        host === '0000:0000:0000:0000:0000:0000:0000:0001'
    )
}

function isIpv6(address: AddressInfo): boolean {
    return (
        address.family === 'IPv6' ||
        // In node >=18.0 <18.4 this was an integer value. This was changed in a minor version.
        // See: https://github.com/laravel/vite-plugin/issues/103
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-next-line
        address.family === 6
    )
}
