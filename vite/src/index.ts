import fs from 'fs'
import { AddressInfo } from 'net'
import path from 'path'
import colors from 'picocolors'
import { Plugin, UserConfig, ResolvedConfig } from 'vite'
import {
    pluginVersion,
    execPython,
    resolveDevServerUrl,
    writeAliases,
    getAppAliases,
} from './helpers'
import {
    DevServerUrl,
    InternalConfig,
    PluginConfig,
    resolveBuildConfig,
    resolvePluginConfig,
    resolveServerConfig,
} from './config'

let DJANGO_VERSION = '...'

export async function djangoVitePlugin(
    config: PluginConfig | string | string[],
): Promise<Plugin[]> {
    if (typeof config === 'string' || Array.isArray(config)) {
        config = { input: config }
    }
    process.stdout.write('Loading configurations...\r')
    const appConfig = JSON.parse(
        await execPython(['--action', 'config'], config),
    )

    if (DJANGO_VERSION === '...') {
        process.stdout.write('Loading django version...\r')
        execPython(['--action', 'version'], config).then(
            (v: string) => (DJANGO_VERSION = v),
        )
    }

    process.stdout.write('\r'.padStart(26, ' '))

    config = await resolvePluginConfig(config, appConfig)
    return [
        djangoPlugin(config as InternalConfig),
        fullReload(config.reloader || false, config.watch),
    ]
}

function djangoPlugin(config: InternalConfig): Plugin {
    const defaultAliases: Record<string, string> = getAppAliases(
        config.appConfig,
    )

    let viteDevServerUrl: DevServerUrl
    let resolvedConfig: ResolvedConfig

    if (config.addAliases) {
        writeAliases(config, defaultAliases)
    }

    return {
        name: 'django-vite-plugin',
        enforce: 'pre',
        config: (userConfig: UserConfig, { command }) => {
            const server = resolveServerConfig(config, userConfig.server)
            const build = resolveBuildConfig(config, userConfig.build)

            return {
                ...userConfig,
                base:
                    command == 'build' ? config.appConfig.BUILD_URL_PREFIX : '',
                root: userConfig.root || config.root || '.',
                build,
                server,
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
        configResolved(config) {
            resolvedConfig = config
        },

        transform(code) {
            if (resolvedConfig.command === 'serve') {
                code = code.replace(
                    /__django_vite_placeholder__/g,
                    viteDevServerUrl,
                )
                return code
            }
        },
        configureServer(server) {
            server.httpServer?.once('listening', () => {
                const address = server.httpServer?.address()

                const isAddressInfo = (
                    x: string | AddressInfo | null | undefined,
                ): x is AddressInfo => typeof x === 'object'
                if (isAddressInfo(address)) {
                    viteDevServerUrl = resolveDevServerUrl(
                        address,
                        server.config,
                    )

                    setTimeout(() => {
                        server.config.logger.info(
                            `\n  ${colors.red(
                                `${colors.bold('DJANGO')}`,
                            )} ${DJANGO_VERSION} ${colors.dim(
                                'plugin',
                            )} ${colors.bold(`v${pluginVersion()}`)}`,
                        )
                        server.config.logger.info('')
                    }, 100)
                }
            })

            return () =>
                server.middlewares.use((req, res, next) => {
                    if (req.url === '/index.html') {
                        res.statusCode = 404
                        res.end(
                            fs
                                .readFileSync(path.join(__dirname, 'info.html'))
                                .toString(),
                        )
                    }

                    next()
                })
        },
    }
}

function fullReload(
    reload: boolean | ((file: string) => boolean),
    watch?: string[],
): Plugin {
    if (!reload) {
        return {
            name: 'django-vite-plugin-reloader',
        }
    }
    if (reload === true) {
        reload = (file: string) => /\.(html|py)$/.test(file)
    }

    return {
        name: 'django-vite-plugin-reloader',
        configureServer({ ws, watcher }) {
            watcher.on('change', (file) => {
                // @ts-ignore
                if (reload(file)) {
                    ws.send({ type: 'full-reload', path: file })
                }
            })
            if (watch) {
                watch.forEach((file) => {
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
