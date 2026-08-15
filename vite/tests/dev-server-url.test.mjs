// The host/protocol/port the hot file hands to browsers, decided by
// `resolveDevServerUrl` from the bound address and the user's server config.
// Wildcards are the interesting part: neither a wildcard bind nor a wildcard
// `server.host` names an address a browser can load from (audit #1, issues
// #55, #83, #88).
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { DIST, PLACEHOLDER, recordingLogger } from './helpers.mjs'

const { resolveDevServerUrl } = await import(
    path.join(DIST, 'esm', 'helpers.js')
)

/** The bits of `AddressInfo` the resolver reads. */
function bind(address, { port = 5173, family } = {}) {
    return {
        address,
        port,
        family: family ?? (address.includes(':') ? 'IPv6' : 'IPv4'),
    }
}

/** Resolves against a stub config, and reports what got logged. */
function resolve(address, server = {}) {
    const { lines, logger } = recordingLogger()
    const url = resolveDevServerUrl(address, { server, logger })
    return { url, lines, warned: lines.length > 0 }
}

const LOOPBACK = bind('127.0.0.1')
const V4_WILDCARD = bind('0.0.0.0')
const V6_WILDCARD = bind('::')

test('a loopback bind names itself', () => {
    // Left as it binds: '127.0.0.1' is a host CSP parses and the origin
    // runserver prints, so there is nothing to translate away from
    assert.equal(resolve(LOOPBACK).url, 'http://127.0.0.1:5173')
})

test('an IPv6 loopback bind is handed out as localhost', () => {
    // What vite calls this bind everywhere it reports itself. Bare, the hot
    // file said 'http://[::1]:5173', which CSP rejects as an invalid host and
    // browsers then refuse to load the assets from (issue #90)
    for (const loopback of ['::1', '0000:0000:0000:0000:0000:0000:0000:0001']) {
        assert.equal(
            resolve(bind(loopback)).url,
            'http://localhost:5173',
            loopback,
        )
    }
})

test('a LAN bind names itself', () => {
    assert.equal(
        resolve(bind('192.168.1.10'), { host: '192.168.1.10' }).url,
        'http://192.168.1.10:5173',
    )
})

test('an IPv6 bind is bracketed', () => {
    // A routable one: the loopback is handed out as localhost instead
    assert.equal(resolve(bind('2001:db8::1')).url, 'http://[2001:db8::1]:5173')
})

test('an IPv6 bind on old node, where family was a number, is bracketed too', () => {
    // node >=18.0 <18.4 reported `family: 6`; see laravel/vite-plugin#103.
    assert.equal(
        resolve(bind('fe80::1', { family: 6 })).url,
        'http://[fe80::1]:5173',
    )
})

// --- IPv6 literals from the config (audit #2) ------------------------------
//
// Only the *bound* address used to be bracketed, so any IPv6 literal the user
// configured went into the hot file bare: 'http://::1:5173', which no browser
// and no URL parser accepts.

/** The IPv6 forms a config host realistically takes. */
const V6_LITERALS = [
    '::1', // loopback
    'fe80::1', // link-local
    '2001:db8::1', // documentation prefix
    '2001:0db8:0000:0000:0000:ff00:0042:8329', // fully expanded
    '::ffff:192.168.1.1', // IPv4-mapped
    'fd00::1', // unique local
]

for (const literal of V6_LITERALS) {
    test(`the IPv6 server.host '${literal}' is bracketed`, () => {
        const { url } = resolve(V6_WILDCARD, { host: literal })
        assert.equal(url, `http://[${literal}]:5173`)
        assert.equal(new URL(url).port, '5173')
    })

    test(`the IPv6 hmr host '${literal}' is bracketed`, () => {
        const { url } = resolve(V4_WILDCARD, {
            host: true,
            hmr: { host: literal },
        })
        assert.equal(url, `http://[${literal}]:5173`)
        assert.equal(new URL(url).port, '5173')
    })
}

test('a bracketed config host is not bracketed twice', () => {
    for (const host of ['[::1]', '[fe80::1]', '[2001:db8::1]']) {
        assert.equal(resolve(V6_WILDCARD, { host }).url, `http://${host}:5173`)
        assert.equal(
            resolve(V6_WILDCARD, { hmr: { host } }).url,
            `http://${host}:5173`,
        )
    }
})

test('hosts without a colon are handed over untouched', () => {
    // Bracketing keys off the colon, so everything else must pass through.
    for (const host of [
        'localhost',
        '192.168.1.10',
        '10.0.0.5',
        'vite.example.test',
        'my-host.local',
        'host_with_underscore',
    ]) {
        assert.equal(resolve(V4_WILDCARD, { host }).url, `http://${host}:5173`)
    }
})

test('a zone id is bracketed like any other literal', () => {
    // URLs cannot carry a zone id at all (browsers reject '%eth0' either way),
    // so this only pins down that we do not single it out.
    assert.equal(
        resolve(V6_WILDCARD, { hmr: { host: 'fe80::1%eth0' } }).url,
        'http://[fe80::1%eth0]:5173',
    )
})

test('an IPv6 config host is not confused with a wildcard', () => {
    // '::' and '[::]' contain colons too, but they name no reachable address.
    assert.equal(
        resolve(V6_WILDCARD, { host: '::' }).url,
        'http://localhost:5173',
    )
    assert.equal(
        resolve(V6_WILDCARD, { host: '[::]' }).url,
        'http://localhost:5173',
    )
    assert.equal(resolve(V6_WILDCARD, { host: '::1' }).url, 'http://[::1]:5173')
})

test('a wildcard hmr host falls through to an IPv6 server.host, bracketed', () => {
    const { url } = resolve(V6_WILDCARD, {
        host: '2001:db8::1',
        hmr: { host: '::' },
    })
    assert.equal(url, 'http://[2001:db8::1]:5173')
})

test('an IPv6 host survives an hmr protocol and client port', () => {
    const { url } = resolve(V6_WILDCARD, {
        host: true,
        hmr: { protocol: 'wss', host: '2001:db8::1', clientPort: 443 },
    })
    assert.equal(url, 'https://[2001:db8::1]:443')
    const parsed = new URL(url)
    assert.equal(parsed.protocol, 'https:')
    assert.equal(parsed.hostname, '[2001:db8::1]')
})

test('a usable IPv6 config host silences the network warning', () => {
    assert.ok(!resolve(V6_WILDCARD, { host: '2001:db8::1' }).warned)
    assert.ok(
        !resolve(V4_WILDCARD, { host: true, hmr: { host: '::1' } }).warned,
    )
})

test('an IPv6 bound address is never bracketed twice by a config host', () => {
    // The bound-address branch brackets on its own; the config branch must not
    // then wrap the already-bracketed result.
    assert.equal(
        resolve(bind('fe80::1'), { host: 'fe80::1' }).url,
        'http://[fe80::1]:5173',
    )
})

test('every URL this resolver returns is a parseable URL', () => {
    // The bug was not a cosmetic one: 'http://::1:5173' does not parse. Sweep
    // the config space and hold every result to that bar.
    const binds = [
        LOOPBACK,
        V4_WILDCARD,
        V6_WILDCARD,
        bind('192.168.1.10'),
        bind('::1'),
        bind('fe80::1', { family: 6 }),
    ]
    const hosts = [
        undefined,
        true,
        false,
        '',
        '0.0.0.0',
        '::',
        '[::]',
        'localhost',
        '::1',
        '2001:db8::1',
        '[::1]',
        'vite.example.test',
    ]
    const hmrs = [
        undefined,
        true,
        false,
        ...hosts.map((host) => ({ host })),
        { host: '::1', clientPort: 443 },
        { host: '2001:db8::1', protocol: 'wss' },
    ]

    for (const address of binds) {
        for (const host of hosts) {
            for (const hmr of hmrs) {
                const { url } = resolve(address, { host, hmr })
                const where = `bind=${address.address} host=${JSON.stringify(
                    host,
                )} hmr=${JSON.stringify(hmr)} -> ${url}`
                let parsed
                assert.doesNotThrow(() => {
                    parsed = new URL(url)
                }, where)
                assert.ok(parsed.hostname, where)
                // `URL` drops a default port, so check the string itself.
                assert.match(url, /:\d+$/, where)
                assert.ok(!/^\[?::\]?$/.test(parsed.hostname), where)
            }
        }
    }
})

// --- wildcards -------------------------------------------------------------

test('a wildcard bind hands out localhost', () => {
    assert.equal(
        resolve(V4_WILDCARD, { host: true }).url,
        'http://localhost:5173',
    )
    assert.equal(
        resolve(V6_WILDCARD, { host: true }).url,
        'http://localhost:5173',
    )
})

for (const wildcard of ['0.0.0.0', '::', '[::]']) {
    test(`the wildcard host string '${wildcard}' is not taken at its word`, () => {
        // `host: '0.0.0.0'` is the usual Docker recipe; '::' would otherwise
        // produce the outright invalid 'http://:::5173'.
        const { url } = resolve(V4_WILDCARD, { host: wildcard })
        assert.equal(url, 'http://localhost:5173')
    })

    test(`the wildcard hmr host '${wildcard}' is not taken at its word`, () => {
        const { url } = resolve(V4_WILDCARD, {
            host: true,
            hmr: { host: wildcard },
        })
        assert.equal(url, 'http://localhost:5173')
    })
}

test('a wildcard hmr host falls through to a usable server.host', () => {
    const { url } = resolve(V4_WILDCARD, {
        host: '192.168.1.10',
        hmr: { host: '0.0.0.0' },
    })
    assert.equal(url, 'http://192.168.1.10:5173')
})

test('an empty host string is no more usable than a wildcard', () => {
    assert.equal(
        resolve(V4_WILDCARD, { host: '' }).url,
        'http://localhost:5173',
    )
    assert.equal(
        resolve(LOOPBACK, { hmr: { host: '' } }).url,
        'http://127.0.0.1:5173',
    )
})

// --- host precedence -------------------------------------------------------

test('the hmr host wins over server.host', () => {
    const { url } = resolve(V4_WILDCARD, {
        host: '10.0.0.5',
        hmr: { host: 'vite.example.test' },
    })
    assert.equal(url, 'http://vite.example.test:5173')
})

test('a named server.host is used when there is no hmr host', () => {
    const { url } = resolve(V4_WILDCARD, { host: 'vite.example.test' })
    assert.equal(url, 'http://vite.example.test:5173')
})

test('server.host: false leaves the bound address to speak', () => {
    assert.equal(
        resolve(LOOPBACK, { host: false }).url,
        'http://127.0.0.1:5173',
    )
})

test('hmr: true carries no host of its own', () => {
    assert.equal(resolve(LOOPBACK, { hmr: true }).url, 'http://127.0.0.1:5173')
})

test('hmr: false carries no host of its own', () => {
    assert.equal(resolve(LOOPBACK, { hmr: false }).url, 'http://127.0.0.1:5173')
})

// --- the network warning ---------------------------------------------------

test('a wildcard bind with nothing better warns, and names the bind address', () => {
    for (const address of [V4_WILDCARD, V6_WILDCARD]) {
        const { lines, warned } = resolve(address, { host: true })
        assert.ok(warned)
        assert.match(lines[0], /server\.hmr\.host/)
        assert.ok(
            lines.some((line) => line.includes(address.address)),
            `logged: ${lines.join(' | ')}`,
        )
    }
})

test('the warning names every gate a LAN device has to get past', () => {
    // Reaching vite is only the first one. Since 6.0.9 vite answers
    // cross-origin requests from nothing but localhost, so a phone loading
    // Django at a LAN address still has the module scripts blocked - and a
    // host named rather than numbered is turned away by allowedHosts (#25).
    const { lines } = resolve(V4_WILDCARD, { host: true })
    const warning = lines.join(' ')

    assert.match(warning, /server\.hmr\.host/)
    assert.match(warning, /server\.cors/)
    assert.match(warning, /server\.allowedHosts/)
})

test('a wildcard host string warns as well', () => {
    // The old check only looked at `host === true`, so this case was silent.
    for (const wildcard of ['0.0.0.0', '::']) {
        assert.ok(resolve(bind(wildcard), { host: wildcard }).warned, wildcard)
    }
})

test('an hmr host silences the warning', () => {
    assert.ok(
        !resolve(V4_WILDCARD, { host: true, hmr: { host: '192.168.1.10' } })
            .warned,
    )
})

test('a named server.host silences the warning', () => {
    assert.ok(!resolve(V4_WILDCARD, { host: 'vite.example.test' }).warned)
})

test('a non-wildcard bind never warns', () => {
    assert.ok(!resolve(LOOPBACK).warned)
    assert.ok(!resolve(bind('192.168.1.10'), { host: '192.168.1.10' }).warned)
    assert.ok(!resolve(bind('::1')).warned)
})

// --- protocol and port -----------------------------------------------------

test('https on the server makes an https URL', () => {
    assert.equal(resolve(LOOPBACK, { https: {} }).url, 'https://127.0.0.1:5173')
})

test('the hmr protocol overrides the server protocol', () => {
    assert.equal(
        resolve(LOOPBACK, { hmr: { protocol: 'wss' } }).url,
        'https://127.0.0.1:5173',
    )
    assert.equal(
        resolve(LOOPBACK, { https: {}, hmr: { protocol: 'ws' } }).url,
        'http://127.0.0.1:5173',
    )
})

test('the hmr client port overrides the bound port', () => {
    assert.equal(
        resolve(bind('127.0.0.1', { port: 5173 }), {
            hmr: { clientPort: 443 },
        }).url,
        'http://127.0.0.1:443',
    )
})

test('a proxied setup gets every part from the hmr config', () => {
    const { url, warned } = resolve(V4_WILDCARD, {
        host: '0.0.0.0',
        hmr: { protocol: 'wss', host: 'assets.example.test', clientPort: 443 },
    })
    assert.equal(url, 'https://assets.example.test:443')
    assert.ok(!warned)
})

// `server.origin` is vite's own way to say where the dev server is reachable,
// and it already rewrites CSS url() with it. The hot file is the other half:
// it is all Django has to build a <script src> from (issue #90).

test('a configured origin is what the hot file hands out', () => {
    const { url, warned } = resolve(V4_WILDCARD, {
        host: '0.0.0.0',
        origin: 'http://my_server_name:5173',
    })
    assert.equal(url, 'http://my_server_name:5173')
    assert.ok(!warned, 'the bind is no longer what browsers are pointed at')
})

test('an origin without a port is left without one', () => {
    assert.equal(
        resolve(LOOPBACK, { origin: 'https://assets.example.com' }).url,
        'https://assets.example.com',
    )
})

test('a trailing slash is not carried into the hot file', () => {
    // Django joins the path on with one of its own
    assert.equal(
        resolve(LOOPBACK, { origin: 'https://assets.example.com//' }).url,
        'https://assets.example.com',
    )
})

test('a path in the origin survives, as vite treats it', () => {
    assert.equal(
        resolve(LOOPBACK, { origin: 'https://example.com/assets' }).url,
        'https://example.com/assets',
    )
})

test('the origin wins over an hmr host', () => {
    assert.equal(
        resolve(V4_WILDCARD, {
            origin: 'https://assets.example.com',
            hmr: { host: '192.168.1.5' },
        }).url,
        'https://assets.example.com',
    )
})

test('the placeholder is not an origin anyone configured', () => {
    const { url, warned } = resolve(LOOPBACK, { origin: PLACEHOLDER })
    assert.equal(url, 'http://127.0.0.1:5173')
    assert.ok(!warned)
})

test('an origin that is not an http url is refused, and said so', () => {
    for (const origin of ['ws://localhost:5173', 'localhost:5173', 'nonsense']) {
        const { url, lines } = resolve(LOOPBACK, { origin })
        assert.equal(url, 'http://127.0.0.1:5173', origin)
        assert.match(lines.join('\n'), /server\.origin/, origin)
    }
})
