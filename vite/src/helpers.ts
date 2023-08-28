import { spawn } from "child_process";
import fs from "fs";
import { AddressInfo } from "net";
import path from "path";
import { ResolvedConfig, normalizePath } from "vite";
import type { AppConfig, DevServerUrl, InternalConfig, PluginConfig } from "./config.js";

export function execPython(
    args: string[],
    config: PluginConfig
): Promise<string> {
    return new Promise((resolve, reject) => {
        args = [...(args || []), ...(config.pyArgs || [])];
        const py = spawn(config.pyPath || "python", [
            path.join(config.root || "", "manage.py"),
            "django_vite_plugin",
            ...args,
        ]);

        let err = "",
            res = "";
        py.stderr.on("data", (data) => {
            err += data.toString();
        });
        py.stdout.on("data", (data) => {
            res += data.toString();
        });
        py.on("close", () => {
            if (err) {
                console.log(err);
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

export function pluginVersion(): string {
    try {
        return JSON.parse(
            fs.readFileSync(path.join(__dirname, "../package.json")).toString()
        )?.version;
    } catch {
        return "";
    }
}

/**
 * Adds 'static' in file paths if already not exists
 */

export async function addStaticToInputs(
    input: string | string[],
    config: PluginConfig
): Promise<string[]> {
    if (typeof input === "string") {
        input = [input];
    }
    const res = await execPython(
        ["--find-static", ...input.map((f) => normalizePath(f))],
        config
    );

    return JSON.parse(res);
}

/**
 * Resolve the dev server URL from the server address and configuration.
 */
export function resolveDevServerUrl(
    address: AddressInfo,
    config: ResolvedConfig
): DevServerUrl {
    const configHmrProtocol =
        typeof config.server.hmr === "object"
            ? config.server.hmr.protocol
            : null;
    const clientProtocol = configHmrProtocol
        ? configHmrProtocol === "wss"
            ? "https"
            : "http"
        : null;
    const serverProtocol = config.server.https ? "https" : "http";
    const protocol = clientProtocol ?? serverProtocol;

    const configHmrHost =
        typeof config.server.hmr === "object" ? config.server.hmr.host : null;
    const configHost =
        typeof config.server.host === "string" ? config.server.host : null;
    const serverAddress = isIpv6(address)
        ? `[${address.address}]`
        : address.address;
    const host = configHmrHost ?? configHost ?? serverAddress;

    const configHmrClientPort =
        typeof config.server.hmr === "object"
            ? config.server.hmr.clientPort
            : null;
    const port = configHmrClientPort ?? address.port;

    return `${protocol}://${host}:${port}`;
}

export function isIpv6(address: AddressInfo) {
    return (
        address.family === "IPv6" ||
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore-next-line
        address.family === 6
    );
}

export async function writeAliases(
    config: InternalConfig,
    aliases: Record<string, string>
) {
    let root = process.cwd();
    if (config.root) {
        root = path.join(root, config.root);
    }
    let jsconfigPath = path.join(root, "jsconfig.json");

    if (!fs.existsSync(jsconfigPath)) {
        if (!config.root) {
            return;
        }
        root = process.cwd();
        jsconfigPath = path.join(root, "jsconfig.json");
        if (!fs.existsSync(jsconfigPath)) {
            return;
        }
    }

    let updated = false;

    const jsconfig = JSON.parse(fs.readFileSync(jsconfigPath, "utf8"));

    jsconfig.compilerOptions = jsconfig.compilerOptions || {};
    const old = jsconfig.compilerOptions.paths || {};

    for (let alias in aliases) {
        let val = normalizePath(path.relative(root, aliases[alias]));
        if (val !== ".") {
            val = "./" + val;
        }
        val += "/*";
        alias += "/*";
        if (!old[alias] || old[alias].indexOf(val) == -1) {
            updated = true;
            old[alias] = [val];
        }
    }

    if (updated) {
        jsconfig.compilerOptions.paths = old;
        fs.writeFileSync(jsconfigPath, JSON.stringify(jsconfig, null, 2));
    }
}

export function createJsConfig(config: InternalConfig) {
    let root = process.cwd();
    let jsconfigPath = path.join(root, "jsconfig.json");

    if (fs.existsSync(jsconfigPath)) {
        return;
    }

    const DEFAULT = {
        exclude: ["node_modules"],
    };

    if (!config.root) {
        fs.writeFileSync(jsconfigPath, JSON.stringify(DEFAULT, null, 2));
        return;
    }
    root = path.join(process.cwd(), config.root);
    jsconfigPath = path.join(root, "jsconfig.json");
    if (fs.existsSync(jsconfigPath)) {
        return;
    }
    fs.writeFileSync(jsconfigPath, JSON.stringify(DEFAULT, null, 2));
}

export function getAppAliases(appConfig: AppConfig): Record<string, string> {
    const aliases: Record<string, string> = {
        "@": "",
    };
    const apps = appConfig.INSTALLED_APPS;

    for (const app in apps) {
        const trail = appConfig.STATIC_LOOKUP ? "/" + app : "";
        aliases[`@s:${app}`] = normalizePath(`${apps[app]}/static${trail}`);
        aliases[`@t:${app}`] = normalizePath(`${apps[app]}/templates${trail}`);
    }
    return aliases;
}
