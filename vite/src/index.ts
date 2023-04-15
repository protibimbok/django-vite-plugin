import { spawn } from 'child_process'
import fs from 'fs'
import { AddressInfo } from 'net'
import path from 'path'
import colors from 'picocolors'
import { Plugin, UserConfig, ResolvedConfig, BuildOptions, ServerOptions, normalizePath } from 'vite'


interface AppConfig{
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


interface PluginConfig{
    /**
     * The path or paths of the entry points to compile.
     */
    input: string|string[]

    /**
     * The root path of the project relative to the `vite.config.js` file
     */
    root?: string,

    /**
     * Configuartion provided in project's `settings.py`
     */
    appConfig: AppConfig

}


type DevServerUrl = `${'http'|'https'}://${string}:${number}`


let DJANGO_VERSION = '...'


export default async function djangoVitePlugin (config: PluginConfig) : Promise<Plugin[]>{
    process.stdout.write("Loading configurations...\r")
    const appConfig = JSON.parse(await execPython(['--action', 'config'], config.root))

    if (DJANGO_VERSION === '...') {
        process.stdout.write("Loading django version...\r")
        execPython(['--action', 'version'], config.root).then((v: string)=> DJANGO_VERSION = v);
    }

    process.stdout.write("\r".padStart(26, " "))

    config = await resolvePluginConfig(config, appConfig)
    return [
        djangoPlugin(config)
    ];
}


function djangoPlugin (config: PluginConfig) : Plugin {
    const defaultAliases: Record<string, string> = getAppAliases(config.appConfig)
    let viteDevServerUrl: DevServerUrl
    let resolvedConfig: ResolvedConfig
    //let wsServer: WebSocketServer
    //let wsConnected = false

    return {
        name: 'django-vite-plugin',
        enforce: 'pre',
        config: (userConfig: UserConfig, { command }) => {

            const server = resolveServerConfig(config, userConfig.server);
            const build = resolveBuildConfig(config, userConfig.build);

            return {
                base: command == 'build'?config.appConfig.BUILD_URL_PREFIX:'',
                root: userConfig.root || config.root || '.',
                build,
                server,
                resolve: {
                    alias: Array.isArray(userConfig.resolve?.alias)
                        ? [
                            ...userConfig.resolve?.alias ?? [],
                            ...Object.keys(defaultAliases).map(alias => ({
                                find: alias,
                                replacement: defaultAliases[alias]
                            }))
                        ]
                        : {
                            ...defaultAliases,
                            ...userConfig.resolve?.alias,
                        }
                },
            }
        },
        configResolved(config) {
            resolvedConfig = config
        },

        transform(code) {
            if (resolvedConfig.command === 'serve') {
                code = code.replace(/__django_vite_placeholder__/g, viteDevServerUrl)
                return code
            }
        },
        configureServer(server) {
            /*
            wsServer = server.ws
            wsServer.on('connection', () => {
                wsConnected = true
            })
            */
            server.httpServer?.once('listening', () => {
                const address = server.httpServer?.address()

                const isAddressInfo = (x: string|AddressInfo|null|undefined): x is AddressInfo => typeof x === 'object'
                if (isAddressInfo(address)) {
                    viteDevServerUrl = resolveDevServerUrl(address, server.config)

                    setTimeout(() => {
                        server.config.logger.info(`\n  ${colors.red(`${colors.bold('DJANGO')}`)} ${DJANGO_VERSION} ${colors.dim('plugin')} ${colors.bold(`v${pluginVersion()}`)}`)
                        server.config.logger.info('')
                    }, 100)
                }
            })

            return () => server.middlewares.use((req, res, next) => {
                if (req.url === '/index.html') {
                    res.statusCode = 404
                    res.end(
                        fs.readFileSync(path.join(__dirname, 'info.html')).toString()
                    )
                }

                next()
            })
        }
    }
}


async function resolvePluginConfig(config: PluginConfig, appConfig: AppConfig): Promise<PluginConfig> {
    if (!config){
        throw new Error('django-vite-plugin: no configuration is provided!')
    }

    if (typeof config === 'string' || Array.isArray(config)){
        //@ts-expect-error appConfig is added after `resolvePluginConfig` call
        config = {input: config}
    }

    if (typeof config.input === 'undefined'){
        throw new Error('django-vite-plugin: no input is provided!')
    }

    if (appConfig.STATIC_LOOKUP) {
        config.input = await addStaticToInputs(config.input, config.root)
    }

    config.appConfig = appConfig;

    return config;
}


function resolveBuildConfig(config: PluginConfig, front?: BuildOptions) : BuildOptions{
    return {
        ...(front || {}),
        manifest: front?.manifest?? true,
        outDir: front?.outDir ?? config.appConfig.BUILD_DIR,
        assetsInlineLimit: front?.assetsInlineLimit ?? 0,
        rollupOptions: {
            ...(front?.rollupOptions || {}),
            input: config.input
        },
    }
}

function resolveServerConfig(config: PluginConfig, front?: ServerOptions) : ServerOptions{
    const serverCfg = config.appConfig.SERVER;
    return {
        ...(front || {}),
        origin: front?.origin ?? '__django_vite_placeholder__',
        host: front?.host || serverCfg.HOST,
        port: front?.port || serverCfg.PORT,
        strictPort: !front?.port,
        https: (serverCfg.CERT && serverCfg.KEY)?{
            key: fs.readFileSync(serverCfg.KEY),
            cert: fs.readFileSync(serverCfg.CERT),
        }:false
    }
}


function getAppAliases(appConfig: AppConfig) : Record<string, string> {
    const aliases: Record<string, string> = {
        '@': '',
    }
    const apps = appConfig.INSTALLED_APPS;

    for(const app in apps){
        const trail = appConfig.STATIC_LOOKUP ? '/' + app : ''
        aliases[`@s:${app}`] = normalizePath(`${apps[app]}/static${trail}`)
        aliases[`@t:${app}`] = normalizePath(`${apps[app]}/templates${trail}`)
    }
    return aliases;
}

/**
 * Get the settings from django project
 */

function execPython(args: string[], root?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const py = spawn('python', [
            path.join(root || '', 'manage.py'),
            'django_vite_plugin',
            ...(args || [])
        ]);

        let err = '',
            res = '';
        py.stderr.on('data', (data) => {
            err += data.toString();
        });
        py.stdout.on('data', (data) => {
            res += data.toString();
        });
        py.on('close', () => {
            if(err){
                console.log(err);
                reject(err);
            }else{
                resolve(res);
            }
        });
    });
}


function pluginVersion(): string {
    try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json')).toString())?.version
    } catch {
        return ''
    }
}


/**
 * Adds 'static' in file paths if already not exists
 */

async function addStaticToInputs(input: string | string[], root?: string): Promise<string[]> {
    if (typeof input === 'string'){
        input = [input]
    }
    const res = await execPython([
        '--find-static',
        ...(input.map(f => normalizePath(f)))
    ], root);

    return JSON.parse(res)
}



/**
 * Resolve the dev server URL from the server address and configuration.
 */
function resolveDevServerUrl(address: AddressInfo, config: ResolvedConfig): DevServerUrl {
    const configHmrProtocol = typeof config.server.hmr === 'object' ? config.server.hmr.protocol : null
    const clientProtocol = configHmrProtocol ? (configHmrProtocol === 'wss' ? 'https' : 'http') : null
    const serverProtocol = config.server.https ? 'https' : 'http'
    const protocol = clientProtocol ?? serverProtocol

    const configHmrHost = typeof config.server.hmr === 'object' ? config.server.hmr.host : null
    const configHost = typeof config.server.host === 'string' ? config.server.host : null
    const serverAddress = isIpv6(address) ? `[${address.address}]` : address.address
    const host = configHmrHost ?? configHost ?? serverAddress

    const configHmrClientPort = typeof config.server.hmr === 'object' ? config.server.hmr.clientPort : null
    const port = configHmrClientPort ?? address.port

    return `${protocol}://${host}:${port}`
}

function isIpv6(address: AddressInfo) {
    return address.family === 'IPv6'
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-next-line
        || address.family === 6;
}