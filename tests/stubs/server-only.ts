/**
 * Stands in for the `server-only` package under Vitest.
 *
 * The real module throws on import so that a bundler fails loudly when a
 * client component pulls a server module into its graph. There is no bundler
 * here and no client graph, so importing it would only ever fail a suite that
 * had done nothing wrong. See the alias in vitest.config.ts.
 */
export {};
