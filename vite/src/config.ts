import fs from 'fs'
import { BuildOptions, normalizePath } from 'vite'
import { glob } from 'glob'
import { addStaticToInputs } from './helpers.js'
import { InputOption } from 'rollup'

export interface AppConfig {
    WS_CLIENT: string
    DEV_MODE: boolean
    BUILD_DIR: string
    BUILD_URL_PREFIX: string
    JS_ATTRS: {
        [key: string]: string
    }
    CSS_ATTRS: {
        [key: string]: string
    }
    STATIC_LOOKUP: boolean
    INSTALLED_APPS: Record<string, string>
    HOT_FILE: string
}

export interface PluginConfig {
    /**
     * The path or paths of the entry points to compile.
     */
    input: InputOption

    /**
     * The root path of the project relative to the `vite.config.js` file
     */
    root?: string

    /**
     * Whether the aliases should be written to `jsconfig.json`/`tsconfig.json`.
     * By default they are written only if such a file already exists; `true`
     * creates a `jsconfig.json` when there is none, `false` writes nothing.
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

    // `addAliases` stays tri-state: `false` writes nothing, `true` also creates
    // a `jsconfig.json` when the project has none, `undefined` only updates an
    // existing config file. See `writeAliases`.

    return config as InternalConfig
}

export function resolveBuildConfig(
    config: InternalConfig,
    front?: BuildOptions,
): BuildOptions {
    return {
        manifest: front?.manifest ?? true,
        outDir: front?.outDir ?? config.appConfig.BUILD_DIR,
        assetsInlineLimit: front?.assetsInlineLimit ?? 0,
        rollupOptions: {
            input: config.input,
        },
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

    const watch: string[] = []

    for (const app in apps) {
        if (fs.existsSync(apps[app])) {
            watch.push(`${normalizePath(apps[app])}/**/*.py`)
        }
    }
    config.watch = glob.globSync(watch)
}
