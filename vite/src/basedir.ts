/**
 * Absolute path to the package root (the directory holding `package.json`).
 *
 * Only the type lives here. The real implementation is emitted per format by
 * `script/build.ts`, because the two builds need different primitives and
 * neither one can be written in a file that is transpiled to both:
 * `__dirname` does not exist in ESM, and `import.meta` is a *parse-time*
 * error in CommonJS, so a runtime `typeof __dirname` guard cannot help.
 */
export declare const BASE_DIR: string
