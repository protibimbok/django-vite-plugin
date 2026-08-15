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
    ORIGIN_PLACEHOLDER,
    aliasesTheUserDidNotClaim,
} from './helpers.js'
import {
    AppConfig,
    DevServerUrl,
    InternalConfig,
    PluginConfig,
    resolveBuildConfig,
    resolvePluginConfig,
} from './config.js'

let DJANGO_VERSION = '...'

export async function djangoVitePlugin(
    config: PluginConfig | string | string[],
): Promise<Plugin[]> {
    if (typeof config === 'string' || Array.isArray(config)) {
        config = { input: config }
    }
    process.stdout.write('Loading configurations...\r')
    const appConfig = await execPythonJSON<AppConfig>(
        ['--action', 'config'],
        config,
    )

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

const hotFiles = new Map<string, string>()

let exitHandlersBound = false

function claimHotFile(
    hotFile: string,
    url: DevServerUrl,
    logger: ResolvedConfig['logger'],
): boolean {
    try {
        fs.mkdirSync(path.dirname(hotFile), { recursive: true })
        fs.writeFileSync(hotFile, url)
    } catch (error) {
        logger.error(
            colors.red(
                `django-vite-plugin: could not write the hot file at '${hotFile}': ` +
                    `${(error as Error).message}. Django reads it to find this ` +
                    'server, and reports it as not started until it can. Set ' +
                    "HOT_FILE in DJANGO_VITE_PLUGIN to a path it can write.",
            ),
        )
        return false
    }
    hotFiles.set(hotFile, url)
    return true
}

function releaseHotFile(hotFile: string, url: string): void {
    if (hotFiles.get(hotFile) === url) {
        hotFiles.delete(hotFile)
    }
    try {
        if (fs.readFileSync(hotFile, 'utf-8') === url) {
            fs.rmSync(hotFile)
        }
    } catch {
        return
    }
}

function djangoPlugin(config: InternalConfig): Plugin[] {
    const defaultAliases: Record<string, string> = getAppAliases(
        config.appConfig,
    )

    let userConfigG: UserConfig
    let resolvedConfig: ResolvedConfig

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
            const ours = aliasesTheUserDidNotClaim(
                defaultAliases,
                userConfig.resolve?.alias,
            )

            const root = userConfig.root || config.root || '.'

            if (config.addAliases !== false) {
                writeAliases(
                    config,
                    defaultAliases,
                    path.resolve(process.cwd(), root),
                    config.addAliases === true,
                    userConfig.resolve?.alias,
                )
            }

            return {
                base:
                    command == 'build' ? config.appConfig.BUILD_URL_PREFIX : '',
                root,
                build,
                server: {
                    origin: userConfig.server?.origin ?? ORIGIN_PLACEHOLDER,
                },
                resolve: {
                    alias: Array.isArray(userConfig.resolve?.alias)
                        ? Object.entries(ours).map(([find, replacement]) => ({
                              find,
                              replacement,
                          }))
                        : {
                              ...ours,
                              ...userConfig.resolve?.alias,
                          },
                },
            }
        },
        configureServer(server) {
            if (!server.httpServer) {
                setDevServerUrl(undefined)
            }
            server.httpServer?.once('listening', () => {
                const address = server.httpServer?.address()

                const isAddressInfo = (
                    x: string | AddressInfo | null | undefined,
                ): x is AddressInfo => typeof x === 'object'
                if (!isAddressInfo(address)) {
                    setDevServerUrl(undefined)
                } else {
                    const boundUrl = resolveDevServerUrl(
                        address,
                        server.config,
                    )
                    setDevServerUrl(boundUrl)
                    claimHotFile(
                        config.appConfig.HOT_FILE,
                        boundUrl,
                        server.config.logger,
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

                    server.httpServer?.once('close', () => {
                        releaseHotFile(config.appConfig.HOT_FILE, boundUrl)
                    })

                    if (!exitHandlersBound) {
                        const clean = () => {
                            for (const [hotFile, url] of [...hotFiles]) {
                                releaseHotFile(hotFile, url)
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
                    if (req.url === '/index.html') {
                        res.statusCode = 404
                        res.end(
                            fs
                                .readFileSync(
                                    path.join(BASE_DIR, 'dist', 'info.html'),
                                )
                                .toString(),
                        )
                    }

                    next()
                })
        },
    }

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
                url = config.appConfig.BUILD_URL_PREFIX ?? ''
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
