import fs from 'fs'
import { AddressInfo } from 'net'
import path from 'path'
import colors from 'picocolors'
import { Plugin, UserConfig } from 'vite'
import {
    pluginVersion,
    execPythonJSON,
    writeAliases,
    getAppAliases,
    resolveDevServerUrl,
    getAbsolutePathFromMetaUrl,
} from './helpers.js'
import {
    DevServerUrl,
    InternalConfig,
    PluginConfig,
    resolveBuildConfig,
    resolvePluginConfig,
} from './config.js'

let DJANGO_VERSION = '...'

const THIS_DIR: string = getAbsolutePathFromMetaUrl(
    typeof __dirname === 'undefined'
        ? // @ts-ignore
          path.dirname(new URL(import.meta.url).pathname)
        : __dirname,
)

export async function djangoVitePlugin(
    config: PluginConfig | string | string[],
): Promise<Plugin[]> {
    if (typeof config === 'string' || Array.isArray(config)) {
        config = { input: config }
    }
    process.stdout.write('Loading configurations...\r')
    const appConfig = await execPythonJSON(['--action', 'config'], config)

    if (DJANGO_VERSION === '...') {
        process.stdout.write('Loading django version...\r')
        execPythonJSON(['--action', 'version'], config).then(
            (v: string) => (DJANGO_VERSION = `"${v}"`),
        )
    }

    process.stdout.write('\r'.padStart(26, ' '))

    config = await resolvePluginConfig(config, appConfig)
    return [
        djangoPlugin(config as InternalConfig),
        fullReload(config as InternalConfig),
    ]
}

let exitHandlersBound = false

function djangoPlugin(config: InternalConfig): Plugin {
    const defaultAliases: Record<string, string> = getAppAliases(
        config.appConfig,
    )

    if (config.addAliases) {
        writeAliases(config, defaultAliases)
    }

    let viteDevServerUrl: DevServerUrl
    let userConfigG: UserConfig

    return {
        name: 'django-vite-plugin',
        enforce: 'pre',
        config: (userConfig: UserConfig, { command }) => {
            const build = resolveBuildConfig(config, userConfig.build)
            userConfigG = userConfig

            return {
                ...userConfig,
                base:
                    command == 'build' ? config.appConfig.BUILD_URL_PREFIX : '',
                root: userConfig.root || config.root || '.',
                build,
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
            server.httpServer?.once('listening', () => {
                const address = server.httpServer?.address()

                const isAddressInfo = (
                    x: string | AddressInfo | null | undefined,
                ): x is AddressInfo => typeof x === 'object'
                if (isAddressInfo(address)) {
                    viteDevServerUrl = resolveDevServerUrl(
                        address,
                        server.config,
                        userConfigG,
                    )
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
                        process.on('SIGINT', process.exit)
                        process.on('SIGTERM', process.exit)
                        process.on('SIGHUP', process.exit)

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
                                .readFileSync(path.join(THIS_DIR, 'info.html'))
                                .toString(),
                        )
                    }

                    next()
                })
        },
    }
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
