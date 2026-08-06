import fs from 'fs'
import { AddressInfo } from 'net'
import path from 'path'
import colors from 'picocolors'
import { Plugin, UserConfig, ResolvedConfig } from 'vite'
import {
    pluginVersion,
    execPythonJSON,
    writeAliases,
    getAppAliases,
    resolveDevServerUrl,
    BASE_DIR,
} from './helpers.js'
import {
    DevServerUrl,
    InternalConfig,
    PluginConfig,
    resolveBuildConfig,
    resolvePluginConfig,
} from './config.js'

// Stands in for the dev server URL, which is not known when `config` runs.
const ORIGIN_PLACEHOLDER =
    'http://__django_vite_plugin_placeholder__.protibimbok'

let DJANGO_VERSION = '...'

export async function djangoVitePlugin(
    config: PluginConfig | string | string[],
): Promise<Plugin[]> {
    if (typeof config === 'string' || Array.isArray(config)) {
        config = { input: config }
    }
    process.stdout.write('Loading configurations...\r')
    const appConfig = await execPythonJSON(['--action', 'config'], config)

    if (DJANGO_VERSION === '...') {
        DJANGO_VERSION = appConfig.DJANGO_VERSION
    }

    process.stdout.write('\r'.padStart(26, ' '))

    config = await resolvePluginConfig(config, appConfig)
    return [
        ...djangoPlugin(config as InternalConfig),
        fullReload(config as InternalConfig),
    ]
}

let exitHandlersBound = false

function djangoPlugin(config: InternalConfig): Plugin[] {
    const defaultAliases: Record<string, string> = getAppAliases(
        config.appConfig,
    )

    if (config.addAliases !== false) {
        writeAliases(config, defaultAliases, config.addAliases === true)
    }

    let userConfigG: UserConfig
    let resolvedConfig: ResolvedConfig

    // The dev server URL is only known once the server is listening, but
    // `transform` may run before that — and in middleware mode there is no
    // server of vite's own to listen at all. So `transform` waits on this
    // promise rather than reading a variable that may still be unset; it
    // resolves to `undefined` when the URL cannot be known.
    let setDevServerUrl!: (url: DevServerUrl | undefined) => void
    const devServerUrl = new Promise<DevServerUrl | undefined>((resolve) => {
        setDevServerUrl = resolve
    })
    let warnedNoOrigin = false

    const main: Plugin = {
        name: 'django-vite-plugin',
        enforce: 'pre',
        config: (userConfig: UserConfig, { command }) => {
            const build = resolveBuildConfig(config, userConfig.build)
            userConfigG = userConfig

            return {
                base:
                    command == 'build' ? config.appConfig.BUILD_URL_PREFIX : '',
                root: userConfig.root || config.root || '.',
                build,
                server: {
                    origin: userConfig.server?.origin ?? ORIGIN_PLACEHOLDER,
                },
                resolve: {
                    alias: Array.isArray(userConfig.resolve?.alias)
                        ? [
                              ...(userConfig.resolve?.alias ?? []),
                              ...Object.keys(defaultAliases).map((alias) => ({
                                  find: alias,
                                  replacement: defaultAliases[alias],
                              })),
                          ]
                        : {
                              ...defaultAliases,
                              ...userConfig.resolve?.alias,
                          },
                },
            }
        },
        configureServer(server) {
            if (!server.httpServer) {
                // Middleware mode: the server vite is mounted in is the one
                // with an origin, and only the user can tell us what it is.
                setDevServerUrl(undefined)
            }
            server.httpServer?.once('listening', () => {
                const address = server.httpServer?.address()

                const isAddressInfo = (
                    x: string | AddressInfo | null | undefined,
                ): x is AddressInfo => typeof x === 'object'
                if (!isAddressInfo(address)) {
                    // A pipe or unix socket has no host:port to hand out.
                    setDevServerUrl(undefined)
                } else {
                    const viteDevServerUrl = resolveDevServerUrl(
                        address,
                        server.config,
                        userConfigG,
                    )
                    setDevServerUrl(viteDevServerUrl)
                    fs.writeFileSync(
                        config.appConfig.HOT_FILE,
                        viteDevServerUrl,
                    )
                    setTimeout(() => {
                        server.config.logger.info(
                            `\n  ${colors.red(
                                `${colors.bold('DJANGO')}`,
                            )} ${DJANGO_VERSION} ${colors.dim(
                                'plugin',
                            )} ${colors.bold(`"${pluginVersion()}"`)}`,
                        )
                        server.config.logger.info('')
                    }, 100)

                    if (!exitHandlersBound) {
                        const clean = () => {
                            if (fs.existsSync(config.appConfig.HOT_FILE)) {
                                fs.rmSync(config.appConfig.HOT_FILE)
                            }
                        }

                        process.on('exit', clean)
                        process.on('SIGINT', () => process.exit())
                        process.on('SIGTERM', () => process.exit())
                        process.on('SIGHUP', () => process.exit())

                        exitHandlersBound = true
                    }
                }
            })

            return () =>
                server.middlewares.use((req, res, next) => {
                    if (req.url !== '/index.html') {
                        return next()
                    }
                    
                    res.statusCode = 404
                    res.setHeader('Content-Type', 'text/html')
                    res.end(
                        fs
                            .readFileSync(
                                path.join(BASE_DIR, 'dist', 'info.html'),
                            )
                            .toString(),
                    )
                })
        },
    }

    // The placeholder is swapped out in a separate `post` plugin: `vite:css`
    // rewrites `url()` references with `server.origin` in its own transform,
    // which runs after every `pre` transform — replacing from `pre` left the
    // placeholder host in every stylesheet the dev server served (audit #24).
    const originResolver: Plugin = {
        name: 'django-vite-plugin-origin-resolver',
        enforce: 'post',
        configResolved(config) {
            resolvedConfig = config
        },
        async transform(code) {
            if (!code.includes(ORIGIN_PLACEHOLDER)) {
                return null
            }
            let url: string
            if (resolvedConfig?.command === 'serve') {
                // Falling back to '' leaves the URL root-relative, which is
                // what vite itself emits when no `server.origin` is set.
                url = (await devServerUrl) ?? ''
                if (!url && !warnedNoOrigin) {
                    warnedNoOrigin = true
                    resolvedConfig.logger.warn(
                        colors.yellow(
                            'django-vite-plugin: could not determine the dev server URL, ' +
                                'so asset URLs are left relative to the page that loads them. ' +
                                "Set 'server.origin' in vite.config.js to the URL vite is reachable at.",
                        ),
                    )
                }
            } else {
                url = config.appConfig.BUILD_URL_PREFIX
            }

            return {
                code: code.split(ORIGIN_PLACEHOLDER).join(url),
                map: null,
            }
        },
    }

    return [main, originResolver]
}

function fullReload(config: InternalConfig): Plugin {
    if (!config.reloader) {
        return {
            name: 'django-vite-plugin-reloader',
        }
    }
    let reloader = config.reloader
    if (reloader === true) {
        reloader = (file: string) => /\.(html|py)$/.test(file)
    }

    return {
        name: 'django-vite-plugin-reloader',
        configureServer({ ws, watcher }) {
            watcher.on('change', (file) => {
                // @ts-ignore
                if (reloader(file)) {
                    setTimeout(
                        () => ws.send({ type: 'full-reload', path: '*' }),
                        config.delay,
                    )
                }
            })
            if (config.watch) {
                config.watch.forEach((file) => {
                    if (file.indexOf('__pycache__') >= 0) {
                        return
                    }
                    watcher.add(file)
                })
            }
        },
    }
}

export default djangoVitePlugin
