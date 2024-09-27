import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { ResolvedConfig, UserConfig, normalizePath } from 'vite'

import { parse, modify, applyEdits } from 'jsonc-parser'

import type {
    AppConfig,
    DevServerUrl,
    InternalConfig,
    PluginConfig,
} from './config.js'
import { AddressInfo } from 'net'

const BASE_DIR: string = path.dirname(
    typeof __dirname === 'undefined'
        ? // @ts-ignore
          path.dirname(new URL(import.meta.url).pathname)
        : __dirname,
)

export function execPythonNoErr(
    args: string[],
    config: PluginConfig,
): Promise<[string, string]> {
    return new Promise((resolve) => {
        args = [...(args || []), ...(config.pyArgs || [])]
        const py = spawn(config.pyPath || 'python', [
            path.join(config.root || '', 'manage.py'),
            'django_vite_plugin',
            ...args,
        ])

        let err = '',
            res = ''
        py.stderr.on('data', (data) => {
            err += data.toString()
        })
        py.stdout.on('data', (data) => {
            res += data.toString()
        })
        py.on('close', () => {
            resolve([res, err])
        })
    })
}

export async function execPythonJSON(
    args: string[],
    config: PluginConfig,
): Promise<any> {
    const [res, err] = await execPythonNoErr(args, config)
    try {
        return JSON.parse(res)
    } catch (error) {
        if (err) {
            throw new Error(err)
        } else {
            throw error
        }
    }
}

export function pluginVersion(): string {
    try {
        return JSON.parse(
            fs.readFileSync(path.join(BASE_DIR, '/package.json')).toString(),
        )?.version
    } catch {
        return ''
    }
}

/**
 * Adds 'static' in file paths if already not exists
 */

export async function addStaticToInputs(
    input: string | string[],
    config: PluginConfig,
): Promise<string[]> {
    if (typeof input === 'string') {
        input = [input]
    }
    return await execPythonJSON(
        ['--find-static', ...input.map((f) => normalizePath(f))],
        config,
    )
}

const getJsOrTsConfigPath = (
    config: InternalConfig,
    js: boolean = false,
): { root: string; cfgPath: string } | undefined => {
    let root = process.cwd()
    if (config.root) {
        root = path.join(root, config.root)
    }
    const fileName = js ? 'jsconfig.json' : 'tsconfig.json'
    let cfgPath = path.join(root, fileName)
    if (!fs.existsSync(cfgPath)) {
        if (!config.root) {
            if (!js) {
                return getJsOrTsConfigPath(config, true)
            }
            return
        }
        root = process.cwd()
        cfgPath = path.join(root, fileName)
        if (!fs.existsSync(cfgPath)) {
            if (!js) {
                return getJsOrTsConfigPath(config, true)
            }
            return
        }
    }
    return { root, cfgPath }
}

export async function writeAliases(
    config: InternalConfig,
    aliases: Record<string, string>,
) {
    const cfgOpts = getJsOrTsConfigPath(config)
    if (!cfgOpts) {
        return
    }

    const { root, cfgPath } = cfgOpts

    const fileContent = fs.readFileSync(cfgPath, 'utf8')

    const jsonNode = parse(fileContent, [], { disallowComments: false })
    const old = jsonNode.compilerOptions?.paths || {}

    const updatedPaths: Record<string, string[]> = {}

    for (const alias in old) {
        if (!alias.startsWith('@s:') && !alias.startsWith('@t:')) {
            updatedPaths[alias] = old[alias]
        }
    }

    for (let alias in aliases) {
        let val = normalizePath(path.relative(root, aliases[alias]))
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

    fs.writeFileSync(cfgPath, newContent, 'utf-8')
}

export function createJsConfig(config: InternalConfig) {
    let root = process.cwd()
    let jsconfigPath = path.join(root, 'jsconfig.json')

    if (fs.existsSync(jsconfigPath)) {
        return
    }

    const DEFAULT = {
        exclude: ['node_modules'],
    }

    if (!config.root) {
        fs.writeFileSync(jsconfigPath, JSON.stringify(DEFAULT, null, 2))
        return
    }
    root = path.join(process.cwd(), config.root)
    jsconfigPath = path.join(root, 'jsconfig.json')
    if (fs.existsSync(jsconfigPath)) {
        return
    }
    fs.writeFileSync(jsconfigPath, JSON.stringify(DEFAULT, null, 2))
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

export function resolveDevServerUrl(
    address: AddressInfo,
    config: ResolvedConfig,
    _userConfig: UserConfig,
): DevServerUrl {
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
    const serverAddress = isIpv6(address)
        ? `[${address.address}]`
        : address.address
    const host = configHmrHost ?? configHost ?? serverAddress

    const configHmrClientPort =
        typeof config.server.hmr === 'object'
            ? config.server.hmr.clientPort
            : null
    const port = configHmrClientPort ?? address.port

    return `${protocol}://${host}:${port}`
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
