import fs from 'fs'
import { BuildOptions, ServerOptions } from 'vite'
import { glob } from 'glob'
import { addStaticToInputs, createJsConfig } from './helpers.js'

export interface AppConfig {
    WS_CLIENT: string
    DEV_MODE: boolean
    BUILD_DIR: string
    BUILD_URL_PREFIX: string
    SERVER: {
        HTTPS: boolean
        HOST: string
        PORT: number
        KEY?: string
        CERT?: string
    }
    JS_ATTRS: {
        [key: string]: string
    }
    CSS_ATTRS: {
        [key: string]: string
    }
    STATIC_LOOKUP: boolean
    INSTALLED_APPS: Record<string, string>
}

export interface PluginConfig {
    /**
     * The path or paths of the entry points to compile.
     */
    input: string | string[]

    /**
     * The root path of the project relative to the `vite.config.js` file
     */
    root?: string

    /**
     * If the aliases should be added in the `jsconfig.json` or not
     */
    addAliases?: boolean

    /**
     * Path to python executable
     */
    pyPath?: string
    /**
     * Path to python executable
     */
    pyArgs?: Array<string>

    /**
     * Full reload options
     */
    reloader?: boolean | ((file: string) => boolean)
    watch?: string[]
    delay?: number
}

export interface InternalConfig extends PluginConfig {
    /**
     * Configuartion provided in project's `settings.py`
     */
    appConfig: AppConfig
}

export type DevServerUrl = `${'http' | 'https'}://${string}:${number}`

export async function resolvePluginConfig(
    config: PluginConfig,
    appConfig: AppConfig,
): Promise<InternalConfig> {
    if (!config) {
        throw new Error('django-vite-plugin: no configuration is provided!')
    }

    if (typeof config.input === 'undefined') {
        throw new Error('django-vite-plugin: no input is provided!')
    }

    const promises: any = [
        resolveFullReloadConfig(config, appConfig.INSTALLED_APPS),
    ]

    if (appConfig.STATIC_LOOKUP) {
        promises.push(addStaticToInputs(config.input, config))
    }

    const res = await Promise.all(promises)
    if (appConfig.STATIC_LOOKUP) {
        config.input = res[1]
    }

    //@ts-expect-error no way to convert decleared types
    config.appConfig = appConfig

    if (config.addAliases === true) {
        createJsConfig(config as InternalConfig)
    }

    config.addAliases = config.addAliases !== false

    return config as InternalConfig
}

export function resolveBuildConfig(
    config: InternalConfig,
    front?: BuildOptions,
): BuildOptions {
    return {
        ...(front || {}),
        manifest: front?.manifest ?? true,
        outDir: front?.outDir ?? config.appConfig.BUILD_DIR,
        assetsInlineLimit: front?.assetsInlineLimit ?? 0,
        rollupOptions: {
            ...(front?.rollupOptions || {}),
            input: config.input,
        },
    }
}

export function resolveServerConfig(
    config: InternalConfig,
    front?: ServerOptions,
): ServerOptions {
    const serverCfg = config.appConfig.SERVER
    const host = serverCfg.HOST
    const port = serverCfg.PORT
    const https =
        serverCfg.CERT && serverCfg.KEY
            ? {
                  key: fs.readFileSync(serverCfg.KEY),
                  cert: fs.readFileSync(serverCfg.CERT),
              }
            : undefined
    return {
        ...(front || {}),
        origin: `http${https ? 's' : ''}://${host}:${port}`,
        host,
        port,
        strictPort: true,
        https,
    }
}

async function resolveFullReloadConfig(
    config: PluginConfig,
    apps: Record<string, string>,
) {
    if (typeof config.reloader === 'undefined') {
        config.reloader = true
    } else if (!config.reloader) {
        config.watch = []
        return
    }

    if (typeof config.delay !== 'number') {
        config.delay = 3000
    }

    if (Array.isArray(config.watch)) {
        return
    }

    const root = config.root || '.'
    const watch: string[] = []

    for (const app in apps) {
        if (fs.existsSync(root + '/' + app)) {
            watch.push(`${root}/${app}/**/*.py`)
        }
    }
    config.watch = glob.globSync(watch)
}
